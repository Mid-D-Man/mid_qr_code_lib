// =============================================================================
// mid-qr — Public API entry point
//
// import { MidQr }          from 'mid-qr';  // combined facade (recommended)
// import { MidQrGenerator } from 'mid-qr';  // generation + static decode only
// import { MidQrScanner }   from 'mid-qr';  // camera scanning only
//
// REQUIRED: load nimiq UMD before your module script:
//   <script src="path/to/qr-scanner.umd.min.js"></script>
//
// This sets window.QrScanner which both MidQrGenerator.decode() and
// MidQrScanner use internally.  The UMD build also resolves the worker
// path correctly relative to its own URL.
// =============================================================================

export { MidQrGenerator } from './generator.js';
export { MidQrScanner }   from './scanner.js';
export type {
  GenerateOptions,
  GradientOptions,
  GradientDirection,
  LogoOptions,
  LogoBorderOptions,
  ErrorLevel,
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  MidQrStatus,
} from './types.js';

// ── MidQr — combined facade ───────────────────────────────────────────────────

import { MidQrGenerator }       from './generator.js';
import { MidQrScanner }         from './scanner.js';
import type { QrScannerSource } from './utils.js';
import type {
  GenerateOptions,
  ScannerOptions,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  MidQrStatus,
} from './types.js';

/**
 * Combined facade — exposes generation, static decode, and camera scanning
 * through a single object.
 *
 * ```ts
 * const qr = await MidQr.create(new URL('/wasm/mid_qr_wasm_bg.wasm', location.origin));
 *
 * // Generate
 * const svg = qr.generate({ data: 'https://example.com', size: 300 });
 *
 * // Decode a file upload (uses nimiq QrScanner.scanImage internally)
 * const text = await qr.decode(fileInput.files[0]);
 *
 * // Camera scanning
 * const scanner = await qr.createScanner(videoEl, result => console.log(result.data));
 * await scanner.start();
 * ```
 */
export class MidQr {
  private readonly _gen: MidQrGenerator;

  private constructor(gen: MidQrGenerator) {
    this._gen = gen;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  /**
   * Initialise the WASM module and return a ready-to-use MidQr instance.
   *
   * @param wasmUrl  Explicit path to the `.wasm` binary.
   *                 Required on GitHub Pages / CDN deployments where the
   *                 served path differs from `import.meta.url`.
   *
   * ```ts
   * MidQr.create(new URL('/wasm/mid_qr_wasm_bg.wasm', location.origin))
   * ```
   */
  static async create(wasmUrl?: string | URL): Promise<MidQr> {
    const gen = await MidQrGenerator.create(wasmUrl);
    return new MidQr(gen);
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /** Generate a QR code SVG string. */
  generate(options: GenerateOptions): string {
    return this._gen.generate(options);
  }

  /** Generate a plain QR code with no options object. */
  generateSimple(
    data:       string,
    size        = 300,
    darkColor   = '#000000',
    lightColor  = '#FFFFFF',
  ): string {
    return this._gen.generateSimple(data, size, darkColor, lightColor);
  }

  // ── Static-image decode ────────────────────────────────────────────────────

  /**
   * Decode a QR code from a still image via nimiq QrScanner.scanImage().
   *
   * Accepted sources: File | Blob | URL | string (URL)
   *   HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap
   *
   * Requires qr-scanner.umd.min.js loaded via <script> tag.
   */
  decode(source: QrScannerSource): Promise<string> {
    return this._gen.decode(source);
  }

  // ── Camera scanner ─────────────────────────────────────────────────────────

  /**
   * Create a real-time camera scanner attached to a video element.
   * Multiple instances can run simultaneously on different video elements.
   */
  createScanner(
    video:    HTMLVideoElement,
    onDecode: OnDecodeCallback,
    options?: ScannerOptions,
    onError?: OnDecodeErrorCallback,
  ): Promise<MidQrScanner> {
    return MidQrScanner.create(video, onDecode, options, onError);
  }

  /** Check whether the device has at least one camera. */
  static hasCamera(): Promise<boolean> {
    return MidQrScanner.hasCamera();
  }

  /** List all available cameras. */
  static listCameras(): Promise<CameraInfo[]> {
    return MidQrScanner.listCameras();
  }

  // ── Info ───────────────────────────────────────────────────────────────────

  /** Library version string from the WASM build. */
  get version(): string {
    return this._gen.version;
  }

  /** Diagnostics snapshot. */
  get status(): MidQrStatus {
    return {
      wasmLoaded:            true,
      version:               this._gen.version,
      nativeBarcodeDetector:
        typeof window !== 'undefined' && 'BarcodeDetector' in window,
    };
  }
}
