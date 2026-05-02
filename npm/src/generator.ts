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

interface BarcodeDetectorResult {
  rawValue: string;
  format:   string;
}

interface BarcodeDetectorLike {
  detect(
    source:
      | ImageBitmap
      | ImageData
      | HTMLImageElement
      | HTMLCanvasElement
      | HTMLVideoElement
      | Blob
      | OffscreenCanvas
  ): Promise<BarcodeDetectorResult[]>;
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

// ── Lazy WASM init ────────────────────────────────────────────────────────────

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

type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function drawToCanvas(
  source: CanvasImageSource,
  width:  number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: AnyCtx } {
  if (typeof OffscreenCanvas !== 'undefined') {
    try {
      const oc  = new OffscreenCanvas(width, height);
      const ctx = oc.getContext('2d');
      if (ctx) {
        ctx.drawImage(source, 0, 0);
        return { canvas: oc, ctx };
      }
    } catch { /* fall through */ }
  }
  const el  = document.createElement('canvas');
  el.width  = width;
  el.height = height;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('mid-qr: could not create 2D canvas context');
  ctx.drawImage(source, 0, 0);
  return { canvas: el, ctx };
}

// ── Image source → { width, height, data } ───────────────────────────────────

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

  // HTMLCanvasElement
  if (source instanceof HTMLCanvasElement) {
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('mid-qr: could not get 2D context from canvas');
    const id  = ctx.getImageData(0, 0, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  // OffscreenCanvas
  if (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas) {
    const ctx = source.getContext('2d');
    if (!ctx) throw new Error('mid-qr: could not get 2D context from OffscreenCanvas');
    const id  = ctx.getImageData(0, 0, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  // ImageBitmap
  if (source instanceof ImageBitmap) {
    const { ctx } = drawToCanvas(source, source.width, source.height);
    const id      = ctx.getImageData(0, 0, source.width, source.height);
    return { width: id.width, height: id.height, data: id.data };
  }

  // HTMLImageElement
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
    const id      = ctx.getImageData(0, 0, w, h);
    return { width: id.width, height: id.height, data: id.data };
  }

  // File / Blob / URL / string — all result in a Blob that goes through
  // createImageBitmap.  URL and string are fetched to a Blob first.
  let blob: Blob;

  if (source instanceof File || source instanceof Blob) {
    blob = source;
  } else {
    // source is URL | string here — both have a string representation.
    const urlString = source instanceof URL ? source.href : (source as string);
    const res = await fetch(urlString);
    if (!res.ok) {
      throw new Error(`mid-qr: failed to fetch image: ${res.status} ${res.statusText}`);
    }
    blob = await res.blob();
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    // SVG or unrecognised format — try loading via <img> element
    const objUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload  = () => resolve();
        img.onerror = () => reject(new Error('mid-qr: could not decode image blob'));
        img.src = objUrl;
      });
      const w = img.naturalWidth  || img.width;
      const h = img.naturalHeight || img.height;
      const { ctx } = drawToCanvas(img, w, h);
      const id      = ctx.getImageData(0, 0, w, h);
      return { width: id.width, height: id.height, data: id.data };
    } finally {
      URL.revokeObjectURL(objUrl);
    }
  }

  const { ctx } = drawToCanvas(bitmap, bitmap.width, bitmap.height);
  const id      = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
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
        size:       options.size       ?? 300,
        darkColor:  options.darkColor  ?? '#000000',
        lightColor: options.lightColor ?? '#FFFFFF',
        errorLevel: options.errorLevel ?? 'M',
        margin:     options.margin     ?? true,
        gradient:   options.gradient   ?? undefined,
        logo:       options.logo       ?? undefined,
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
      if (isWasmTrap(e)) throw new Error('mid-qr: generation failed internally');
      throw e;
    }
  }

  // ── Static-image decode ────────────────────────────────────────────────────

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

    // ── Path 1: Native BarcodeDetector (Chromium) ──────────────────────────
    const bd = await tryGetBarcodeDetector();
    if (bd) {
      try {
        let bdSource:
          | ImageBitmap
          | ImageData
          | HTMLImageElement
          | HTMLCanvasElement
          | Blob
          | OffscreenCanvas;

        if (
          source instanceof Blob          ||
          source instanceof ImageBitmap   ||
          source instanceof HTMLImageElement ||
          source instanceof HTMLCanvasElement ||
          source instanceof ImageData     ||
          (typeof OffscreenCanvas !== 'undefined' && source instanceof OffscreenCanvas)
        ) {
          bdSource = source as typeof bdSource;
        } else {
          // URL | string — fetch to Blob so BarcodeDetector can accept it
          const urlString = source instanceof URL ? source.href : (source as string);
          const res = await fetch(urlString);
          if (!res.ok) throw new Error(`mid-qr: fetch failed: ${res.status}`);
          bdSource = await res.blob();
        }

        const results = await bd.detect(bdSource);
        if (results.length > 0 && results[0].rawValue) {
          return results[0].rawValue;
        }
      } catch (e) {
        console.warn('mid-qr: BarcodeDetector failed, falling back to rxing:', e);
      }
    }

    // ── Path 2: rxing WASM ─────────────────────────────────────────────────
    const { width, height, data } = await extractImageData(source);

    // HybridBinarizer divides the image into 8×8 blocks. Very small images
    // cause out-of-bounds panics in rxing. Upscale to a safe minimum.
    const MIN_DIM   = 200;
    let finalData   = data;
    let finalWidth  = width;
    let finalHeight = height;

    if (width < MIN_DIM || height < MIN_DIM) {
      const scale = Math.ceil(MIN_DIM / Math.min(width, height));
      const newW  = width  * scale;
      const newH  = height * scale;

      const origCanvas    = document.createElement('canvas');
      origCanvas.width    = width;
      origCanvas.height   = height;
      const origCtx       = origCanvas.getContext('2d');

      if (origCtx) {
        // Copy original pixels into the source canvas.
        // data.buffer may be a SharedArrayBuffer in some environments; slice()
        // always returns a plain ArrayBuffer which ImageData requires.
        const safeBuffer = data.buffer.slice(0) as ArrayBuffer;
        origCtx.putImageData(
          new ImageData(new Uint8ClampedArray(safeBuffer), width, height),
          0,
          0,
        );

        const upCanvas    = document.createElement('canvas');
        upCanvas.width    = newW;
        upCanvas.height   = newH;
        const upCtx       = upCanvas.getContext('2d');

        if (upCtx) {
          upCtx.imageSmoothingEnabled = false;
          upCtx.drawImage(origCanvas, 0, 0, newW, newH);
          const upId  = upCtx.getImageData(0, 0, newW, newH);
          finalData   = upId.data;
          finalWidth  = newW;
          finalHeight = newH;
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
          'Ensure the image contains a clear, complete QR code.'
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
      if (isWasmTrap(e)) throw new Error('mid-qr: no QR code found in luma buffer');
      throw e;
    }
  }

  get version(): string                     { return this._wasm.getVersion(); }
  get supportedErrorLevels(): string        { return this._wasm.getSupportedErrorLevels(); }
  get supportedGradientDirections(): string { return this._wasm.getSupportedGradientDirections(); }
  }
