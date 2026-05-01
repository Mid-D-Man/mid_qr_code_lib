import type { GenerateOptions, MidQrStatus } from './types.js';

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

// ── Internal state ────────────────────────────────────────────────────────────

let _wasm: WasmModule | null = null;
let _initPromise: Promise<WasmModule> | null = null;

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

// ── WASM trap helper ──────────────────────────────────────────────────────────

/**
 * Detect a WebAssembly RuntimeError (WASM trap = Rust panic in release mode).
 *
 * With panic="abort" in the Rust profile, any Rust panic becomes an
 * `unreachable` WASM instruction which the browser surfaces as a
 * `WebAssembly.RuntimeError`. The WASM module instance remains valid after
 * the trap — it behaves like a caught JS exception.
 *
 * We convert it to a descriptive Error rather than letting a cryptic
 * "RuntimeError: unreachable executed" propagate to the caller.
 */
function isWasmTrap(e: unknown): boolean {
  if (typeof WebAssembly === 'undefined') return false;
  return e instanceof WebAssembly.RuntimeError;
}

// ── Generator class ───────────────────────────────────────────────────────────

export class MidQrGenerator {
  private readonly _wasm: WasmModule;

  private constructor(wasm: WasmModule) {
    this._wasm = wasm;
  }

  static async create(wasmUrl?: string | URL): Promise<MidQrGenerator> {
    const wasm = await ensureWasm(wasmUrl);
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
          'mid-qr: generation failed internally — check that data is not too long for the chosen error level'
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
   * Note on RuntimeError: rxing (the Rust decoder) may panic on certain
   * inputs — very small images, heavily corrupted data, or images that
   * cause internal assertion failures in rxing's binarizer. This manifests
   * as a WebAssembly.RuntimeError ("unreachable executed") because Rust's
   * panic=abort turns panics into WASM unreachable instructions.
   *
   * We catch that trap here and surface a clean error message. The WASM
   * module instance stays valid and all subsequent calls continue to work.
   *
   * If you hit this frequently, ensure the image is:
   *   • At least 100×100 pixels
   *   • A real QR code (not a barcode or other format)
   *   • Not excessively large (> 4096×4096 risks stack overflow in rxing)
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
    const { width, height, data } = await this._extractImageData(source);

    // Guard obviously bad inputs before calling into WASM
    if (width < 10 || height < 10) {
      throw new Error(`mid-qr: image too small (${width}×${height}) — minimum 10×10`);
    }
    if (width > 4096 || height > 4096) {
      throw new Error(`mid-qr: image too large (${width}×${height}) — maximum 4096×4096`);
    }

    try {
      return this._wasm.decodeRgba(data, width, height);
    } catch (e) {
      if (isWasmTrap(e)) {
        // rxing panicked internally — convert to a descriptive error.
        // The most common causes:
        //   1. No QR code in the image (rxing hits an unreachable branch)
        //   2. Image too complex (stack overflow in the binarizer)
        //   3. Corrupted / partial QR code
        throw new Error(
          'mid-qr: no QR code found in image, or image is too complex to decode. ' +
          'Ensure the image contains a clear, complete QR code.'
        );
      }
      // Re-throw rxing decode errors (returned as Err, not panics)
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

  get version(): string                    { return this._wasm.getVersion(); }
  get supportedErrorLevels(): string       { return this._wasm.getSupportedErrorLevels(); }
  get supportedGradientDirections(): string { return this._wasm.getSupportedGradientDirections(); }

  // ── Internal ───────────────────────────────────────────────────────────────

  private async _extractImageData(
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
    let bitmap: ImageBitmap;

    if (source instanceof ImageBitmap) {
      bitmap = source;
    } else if (
      source instanceof HTMLCanvasElement ||
      source instanceof OffscreenCanvas
    ) {
      const ctx = (source as HTMLCanvasElement).getContext('2d') as
        | CanvasRenderingContext2D
        | null;
      if (!ctx) throw new Error('mid-qr: could not get 2D context from canvas');
      const id = ctx.getImageData(0, 0, source.width, source.height);
      return { width: id.width, height: id.height, data: id.data };
    } else if (source instanceof HTMLImageElement) {
      if (!source.complete) {
        await new Promise<void>((resolve, reject) => {
          source.onload  = () => resolve();
          source.onerror = () => reject(new Error('mid-qr: image failed to load'));
        });
      }
      bitmap = await createImageBitmap(source);
    } else if (source instanceof File || source instanceof Blob) {
      bitmap = await createImageBitmap(source);
    } else {
      const url = source instanceof URL ? source.href : source;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`mid-qr: failed to fetch image: ${res.status}`);
      const blob = await res.blob();
      bitmap = await createImageBitmap(blob);
    }

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx    = canvas.getContext('2d');
    if (!ctx) throw new Error('mid-qr: could not create OffscreenCanvas context');
    ctx.drawImage(bitmap, 0, 0);
    const id = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: id.width, height: id.height, data: id.data };
  }
}
