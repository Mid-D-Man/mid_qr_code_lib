import type { GenerateOptions } from './types.js';

// ── WASM module interface ─────────────────────────────────────────────────────

interface WasmModule {
  default(input?: unknown): Promise<unknown>;
  generate(options: object): string;
  generateSimple(data: string, size: number, dark: string, light: string): string;
  decodeRgba(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): string;
  decodeLuma(luma: Uint8Array, width: number, height: number): string;
  rgbaToLuma(rgba: Uint8Array | Uint8ClampedArray): Uint8Array;
  getVersion(): string;
  getSupportedErrorLevels(): string;
  getSupportedGradientDirections(): string;
}

// ── BarcodeDetector type shim ─────────────────────────────────────────────────
// Available natively in Chromium. We use it as a fast first-pass before
// falling back to rxing WASM which can panic on some inputs.

interface BarcodeDetectorResult {
  rawValue: string;
  format:   string;
}

interface BarcodeDetectorLike {
  detect(source: ImageBitmapSource | HTMLCanvasElement | OffscreenCanvas): Promise<BarcodeDetectorResult[]>;
}

interface BarcodeDetectorStatic {
  new(options: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

// ── Internal state ────────────────────────────────────────────────────────────

let _wasm: WasmModule | null = null;
let _initPromise: Promise<WasmModule> | null = null;
let _barcodeDetector: BarcodeDetectorLike | null = null;
let _barcodeDetectorChecked = false;

// ── Lazy init ─────────────────────────────────────────────────────────────────

async function ensureWasm(wasmUrl?: string | URL): Promise<WasmModule> {
  if (_wasm !== null) return _wasm;
  if (_initPromise !== null) return _initPromise;

  _initPromise = (async (): Promise<WasmModule> => {
    const mod = await import('../wasm/mid_qr_wasm.js') as unknown as WasmModule;
    if (wasmUrl !== undefined) {
      await mod.default(wasmUrl);
    } else {
      await mod.default();
    }
    _wasm = mod;
    return mod;
  })();

  return _initPromise;
}

// ── BarcodeDetector lazy init ─────────────────────────────────────────────────

async function tryGetBarcodeDetector(): Promise<BarcodeDetectorLike | null> {
  if (_barcodeDetectorChecked) return _barcodeDetector;
  _barcodeDetectorChecked = true;

  try {
    const win = globalThis as unknown as Record<string, unknown>;
    if (!win['BarcodeDetector']) return null;

    const BD   = win['BarcodeDetector'] as BarcodeDetectorStatic;
    const fmts = await BD.getSupportedFormats();

    if (!fmts.includes('qr_code')) return null;

    _barcodeDetector = new BD({ formats: ['qr_code'] });
    return _barcodeDetector;
  } catch {
    return null;
  }
}

// ── WASM trap detection ───────────────────────────────────────────────────────

function isWasmTrap(e: unknown): boolean {
  if (typeof WebAssembly === 'undefined') return false;
  return e instanceof WebAssembly.RuntimeError;
}

// ── Canvas helper — broad compat ──────────────────────────────────────────────
// OffscreenCanvas.getContext('2d') is unavailable in some environments
// (Safari < 16.4, certain worker scopes). We prefer OffscreenCanvas but fall
// back to a regular HTMLCanvasElement when it fails.

function drawToCanvas(
  source: CanvasImageSource,
  width:  number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  // Try OffscreenCanvas first (no DOM needed, works in workers)
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const oc  = new OffscreenCanvas(width, height);
      const ctx = oc.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0);
        return { canvas: oc, ctx };
      }
    } catch {
      // fall through to HTMLCanvasElement
    }
  }

  // HTMLCanvasElement fallback (main thread only)
  const el = document.createElement('canvas');
  el.width  = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('mid-qr: could not create 2D canvas context');
  ctx.drawImage(source, 0, 0);
  return { canvas: el, ctx };
}

function getImageData(
  ctx:    CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  width:  number,
  height: number,
): ImageData {
  return ctx.getImageData(0, 0, width, height);
}

// ── Image source → ImageData ──────────────────────────────────────────────────

async function extractImageData(
  source:
    | File
    | Blob
    | HTMLImageElement
    | HTMLCanvasElement
    | OffscreenCanvas
    | ImageBitmap
    | URL
    | string,
): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {

  // ── Canvas / OffscreenCanvas — extract directly ────────────────────────────
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('mid-qr: could not get 2D context from canvas');
    const id  = ctx.getImageData(0, 0, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('mid-qr: could not get 2D context from OffscreenCanvas');
    const id  = ctx.getImageData(0, 0, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  // ── ImageBitmap — draw to canvas ───────────────────────────────────────────
  if (source instanceof ImageBitmap) {
    const { ctx } = drawToCanvas(source, source.width, source.height);
    const id      = getImageData(ctx, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  // ── HTMLImageElement ───────────────────────────────────────────────────────
  if (source instanceof HTMLImageElement) {
    if (!source.complete || source.naturalWidth === 0) {
      await new Promise<void>((resolve, reject) => {
        source.onload  = () => resolve();
        source.onerror = () => reject(new Error('mid-qr: image element failed to load'));
      });
    }
    const w = source.naturalWidth  || source.width;
    const h = source.naturalHeight || source.height;
    const { ctx } = drawToCanvas(source, w, h);
    const id      = getImageData(ctx, w, h);
    return { width: id.width, height: id.height, data: id.data };
  }

  // ── File / Blob / URL / string — decode via createImageBitmap ─────────────
  let blob: Blob;

  if (source instanceof File || source instanceof Blob) {
    blob = source;
  } else {
    const url = source instanceof URL ? source.href : source;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`mid-qr: failed to fetch image: ${res.status} ${res.statusText}`);
    blob = await res.blob();
  }

  // createImageBitmap handles PNG, JPEG, WebP, GIF.
  // SVG blobs may fail in some browsers — we catch and try an <img> fallback.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // SVG or unrecognised format — load via <img> element
    const url  = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve();
        img.onerror = () => reject(new Error('mid-qr: could not decode image blob'));
        img.src = url;
      });
      const w = img.naturalWidth  || img.width;
      const h = img.naturalHeight || img.height;
      const { ctx } = drawToCanvas(img, w, h);
      const id      = getImageData(ctx, w, h);
      return { width: id.width, height: id.height, data: id.data };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const { ctx } = drawToCanvas(bitmap, bitmap.width, bitmap.height);
  const id      = getImageData(ctx, bitmap.width, bitmap.height);
  return { width: id.width, height: id.height, data: id.data };
}

// ── Generator class ───────────────────────────────────────────────────────────

export class MidQrGenerator {
  private readonly _wasm: WasmModule;

  private constructor(wasm: WasmModule) {
    this._wasm = wasm;
  }

  static async create(wasmUrl?: string | URL): Promise<MidQrGenerator> {
    const wasm = await ensureWasm(wasmUrl);
    // Kick off BarcodeDetector availability check in the background.
    // Result is cached — no await needed here.
    tryGetBarcodeDetector().catch(() => {});
    return new MidQrGenerator(wasm);
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  generate(options: GenerateOptions): string {
    if (!options.data || options.data.trim().length === 0) {
      throw new Error('mid-qr: data cannot be empty');
    }
    try {
      return this._wasm.generate({
        data:       options.data,
        size:       options.size        ?? 300,
        darkColor:  options.darkColor   ?? '#000000',
        lightColor: options.lightColor  ?? '#FFFFFF',
        errorLevel: options.errorLevel  ?? 'M',
        margin:     options.margin      ?? true,
        gradient:   options.gradient    ?? undefined,
        logo:       options.logo        ?? undefined,
      });
    } catch (e) {
      if (isWasmTrap(e)) {
        throw new Error(
          'mid-qr: generation failed — data may be too long for the chosen error level'
        );
      }
      throw e;
    }
  }

  generateSimple(
    data:       string,
    size        = 300,
    darkColor   = '#000000',
    lightColor  = '#FFFFFF',
  ): string {
    try {
      return this._wasm.generateSimple(data, size, darkColor, lightColor);
    } catch (e) {
      if (isWasmTrap(e)) {
        throw new Error('mid-qr: generation failed internally');
      }
      throw e;
    }
  }

  // ── Static-image decode ────────────────────────────────────────────────────

  /**
   * Decode a QR code from a still image.
   *
   * Decode path:
   *   1. Native BarcodeDetector API (Chromium — fastest, zero WASM overhead)
   *   2. rxing WASM (cross-browser fallback)
   *
   * The BarcodeDetector path avoids rxing entirely, which sidesteps any
   * rxing internal panics on unusual inputs.
   */
  async decode(
    source:
      | File
      | Blob
      | HTMLImageElement
      | HTMLCanvasElement
      | OffscreenCanvas
      | ImageBitmap
      | URL
      | string,
  ): Promise<string> {

    // ── Path 1: Native BarcodeDetector ────────────────────────────────────────
    const bd = await tryGetBarcodeDetector();
    if (bd) {
      try {
        // BarcodeDetector accepts Blob, ImageBitmap, HTMLImageElement,
        // HTMLCanvasElement, OffscreenCanvas, ImageData, VideoFrame directly.
        let bdSource: ImageBitmapSource | HTMLCanvasElement | OffscreenCanvas;

        if (
          source instanceof Blob ||          // includes File
          source instanceof ImageBitmap ||
          source instanceof HTMLImageElement ||
          source instanceof HTMLCanvasElement ||
          source instanceof ImageData ||
          (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)
        ) {
          bdSource = source as HTMLCanvasElement;
        } else {
          // URL / string — fetch to blob first
          const url = source instanceof URL ? source.href : source as string;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`mid-qr: fetch failed: ${res.status}`);
          bdSource  = await res.blob();
        }

        const results = await bd.detect(bdSource);
        if (results.length > 0 && results[0].rawValue) {
          return results[0].rawValue;
        }
        // BarcodeDetector found nothing — fall through to rxing
      } catch (e) {
        // BarcodeDetector threw — fall through to rxing
        console.warn('mid-qr: BarcodeDetector failed, falling back to rxing:', e);
      }
    }

    // ── Path 2: rxing WASM ────────────────────────────────────────────────────
    const { width, height, data } = await extractImageData(source);

    // HybridBinarizer in rxing divides the image into 8×8 blocks.
    // Images smaller than ~64×64 cause index-out-of-bounds panics.
    // We upscale to a safe minimum via canvas before passing to WASM.
    const MIN_DIM = 200;
    let finalData  = data;
    let finalWidth = width;
    let finalHeight = height;

    if (width < MIN_DIM || height < MIN_DIM) {
      const scale = Math.ceil(MIN_DIM / Math.min(width, height));
      const newW  = width  * scale;
      const newH  = height * scale;

      // Draw upscaled to a new canvas with no smoothing (keep QR crisp)
      const tmp = document.createElement('canvas');
      tmp.width  = newW;
      tmp.height = newH;
      const tmpCtx = tmp.getContext('2d');
      if (tmpCtx) {
        tmpCtx.imageSmoothingEnabled = false;
        // Put original data into an ImageData object and draw via ImageBitmap
        const origCanvas = document.createElement('canvas');
        origCanvas.width  = width;
        origCanvas.height = height;
        const origCtx = origCanvas.getContext('2d');
        if (origCtx) {
          origCtx.putImageData(new ImageData(data, width, height), 0, 0);
          tmpCtx.drawImage(origCanvas, 0, 0, newW, newH);
          const upscaled  = tmpCtx.getImageData(0, 0, newW, newH);
          finalData       = upscaled.data;
          finalWidth      = newW;
          finalHeight     = newH;
        }
      }
    }

    if (finalWidth > 4096 || finalHeight > 4096) {
      throw new Error(
        `mid-qr: image too large (${finalWidth}×${finalHeight}) — maximum 4096×4096`
      );
    }

    try {
      return this._wasm.decodeRgba(finalData, finalWidth, finalHeight);
    } catch (e) {
      if (isWasmTrap(e)) {
        throw new Error(
          'mid-qr: no QR code found in image. ' +
          'Ensure the image contains a clear, complete QR code and is not too small or rotated beyond 45°.'
        );
      }
      throw e;
    }
  }

  rgbaToLuma(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
    return this._wasm.rgbaToLuma(rgba);
  }

  decodeLuma(luma: Uint8Array, width: number, height: number): string {
    try {
      return this._wasm.decodeLuma(luma, width, height);
    } catch (e) {
      if (isWasmTrap(e)) {
        throw new Error('mid-qr: no QR code found in luma buffer');
      }
      throw e;
    }
  }

  // ── Info ───────────────────────────────────────────────────────────────────

  get version(): string                     { return this._wasm.getVersion(); }
  get supportedErrorLevels(): string        { return this._wasm.getSupportedErrorLevels(); }
  get supportedGradientDirections(): string { return this._wasm.getSupportedGradientDirections(); }
}
