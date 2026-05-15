// =============================================================================
// mid-qr — Generator + static-image decode
//
// Generation: Rust WASM (mid_qr_wasm)
// Decode:     nimiq QrScanner.scanImage()
//
// Why nimiq for decode?
//   • scanImage() accepts every source type we care about natively
//   • Uses BarcodeDetector (Chromium) automatically, falls back to the same
//     hand-tuned worker that handles camera frames
//   • Eliminates the fragile canvas-extraction / rxing / size-clamp pipeline
//     that was causing unreliable results
// =============================================================================

import type { GenerateOptions } from './types.js';
import { getQrScannerClass, type QrScannerSource } from './utils.js';

// ── WASM module interface (generation only) ───────────────────────────────────

interface WasmModule {
  default(input?: unknown): Promise<unknown>;
  generate(options: object): string;
  generateSimple(
    data: string,
    size: number,
    dark: string,
    light: string
  ): string;
  getVersion(): string;
  getSupportedErrorLevels(): string;
  getSupportedGradientDirections(): string;
}

// ── Lazy WASM init ────────────────────────────────────────────────────────────

let _wasm: WasmModule | null = null;
let _initPromise: Promise<WasmModule> | null = null;

async function ensureWasm(wasmUrl?: string | URL): Promise<WasmModule> {
  if (_wasm !== null) return _wasm;
  if (_initPromise !== null) return _initPromise;

  _initPromise = (async (): Promise<WasmModule> => {
    const mod = (await import(
      '../wasm/mid_qr_wasm.js'
    )) as unknown as WasmModule;

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

// ── WASM trap detection ───────────────────────────────────────────────────────

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

  // ── Factory ────────────────────────────────────────────────────────────────

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
    data:      string,
    size       = 300,
    darkColor  = '#000000',
    lightColor = '#FFFFFF',
  ): string {
    try {
      return this._wasm.generateSimple(data, size, darkColor, lightColor);
    } catch (e) {
      if (isWasmTrap(e)) throw new Error('mid-qr: generation failed internally');
      throw e;
    }
  }

  // ── Static-image decode ────────────────────────────────────────────────────
  //
  // Delegates entirely to nimiq QrScanner.scanImage().
  //
  // Accepted source types (same as QrScanner.scanImage):
  //   File | Blob | URL | string (URL)
  //   HTMLImageElement | HTMLCanvasElement | SVGImageElement
  //   OffscreenCanvas | ImageBitmap | HTMLVideoElement
  //
  // Requires qr-scanner.umd.min.js loaded via <script> tag.

  async decode(source: QrScannerSource): Promise<string> {
    const QrScanner = getQrScannerClass();

    try {
      const result = await QrScanner.scanImage(source, {
        returnDetailedScanResult: true,
      });
      return result.data;
    } catch (err) {
      // nimiq throws its NO_QR_CODE_FOUND string sentinel on no-detect
      if (
        err === QrScanner.NO_QR_CODE_FOUND ||
        String(err).includes('No QR code') ||
        String(err).includes('No QR')
      ) {
        throw new Error(
          'mid-qr: no QR code found in image. ' +
          'Ensure the image contains a clear, complete QR code.'
        );
      }
      throw err;
    }
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
}
