import type { GenerateOptions, MidQrStatus } from './types.js';

// ── WASM module interface ─────────────────────────────────────────────────────
// We use `unknown` for the default() return type because wasm-bindgen generates
// `Promise<InitOutput>` not `Promise<void>`. Using unknown avoids the type
// overlap error while keeping the rest of the interface strict.

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
    // Cast through unknown to avoid the InitOutput vs void incompatibility.
    // The wasm-bindgen generated module satisfies this interface at runtime.
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

// ── Generator class ───────────────────────────────────────────────────────────

/**
 * QR code generator and static-image decoder.
 *
 * ```ts
 * const qr = await MidQrGenerator.create();
 * const svg = qr.generate({ data: 'https://example.com' });
 * document.getElementById('qr')!.innerHTML = svg;
 * ```
 */
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
    return this._wasm.generate({
      data:       options.data,
      size:       options.size        ?? 300,
      darkColor:  options.darkColor   ?? '#000000',
      lightColor: options.lightColor  ?? '#FFFFFF',
      errorLevel: options.errorLevel  ?? 'M',
      margin:     options.margin      ?? true,
      gradient:   options.gradient,
      logo:       options.logo,
    });
  }

  generateSimple(
    data:       string,
    size        = 300,
    darkColor   = '#000000',
    lightColor  = '#FFFFFF',
  ): string {
    return this._wasm.generateSimple(data, size, darkColor, lightColor);
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
    const { width, height, data } = await this._extractImageData(source);
    return this._wasm.decodeRgba(data, width, height);
  }

  rgbaToLuma(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
    return this._wasm.rgbaToLuma(rgba);
  }

  decodeLuma(luma: Uint8Array, width: number, height: number): string {
    return this._wasm.decodeLuma(luma, width, height);
  }

  // ── Info ───────────────────────────────────────────────────────────────────

  get version(): string {
    return this._wasm.getVersion();
  }

  get supportedErrorLevels(): string {
    return this._wasm.getSupportedErrorLevels();
  }

  get supportedGradientDirections(): string {
    return this._wasm.getSupportedGradientDirections();
  }

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
