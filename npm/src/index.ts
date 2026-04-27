// =============================================================================
// mid-qr — Public API entry point
//
// Single import path for all consumers:
//
//   import { MidQr, MidQrScanner } from 'mid-qr';
//
// MidQr         — combined facade (generator + still-image decode).
//                 This is the class most consumers should use.
//
// MidQrGenerator — generator + still-image decode only (no scanner).
//                  Use this if you only need generation/static decode and
//                  want to exclude the nimiq scanner from your bundle.
//
// MidQrScanner   — real-time camera scanner only (no generator).
//                  Use this if you only need camera scanning.
//
// All types are also re-exported for TypeScript consumers.
// =============================================================================

export { MidQrGenerator }   from './generator.js';
export { MidQrScanner }     from './scanner.js';
export type {
  // Generation
  GenerateOptions,
  GradientOptions,
  GradientDirection,
  LogoOptions,
  LogoBorderOptions,
  ErrorLevel,
  // Scanning
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  // Status
  MidQrStatus,
} from './types.js';

// ── MidQr — combined facade ───────────────────────────────────────────────────

import { MidQrGenerator } from './generator.js';
import { MidQrScanner }   from './scanner.js';
import type {
  GenerateOptions,
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  MidQrStatus,
} from './types.js';

/**
 * Combined facade that exposes both generation and scanning under one object.
 *
 * ```ts
 * import { MidQr } from 'mid-qr';
 *
 * // Initialise once at app startup
 * const qr = await MidQr.create();
 *
 * // Generate a QR code
 * const svg = qr.generate({ data: 'https://example.com', size: 300 });
 *
 * // Decode a file upload
 * const text = await qr.decode(file);
 *
 * // Attach a camera scanner
 * const scanner = await qr.createScanner(
 *   videoElement,
 *   result => console.log(result.data)
 * );
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
   * @param wasmUrl  Explicit URL to the `.wasm` binary.
   *                 Required on GitHub Pages or other deployments where the
   *                 served path differs from `import.meta.url`.
   *
   *                 Example:
   *                 ```ts
   *                 MidQr.create(new URL('/wasm/mid_qr_wasm_bg.wasm', location.origin))
   *                 ```
   */
  static async create(wasmUrl?: string | URL): Promise<MidQr> {
    const gen = await MidQrGenerator.create(wasmUrl);
    return new MidQr(gen);
  }

  // ── Generation ─────────────────────────────────────────────────────────────

  /** Generate a QR code SVG.  See {@link MidQrGenerator.generate}. */
  generate(options: GenerateOptions): string {
    return this._gen.generate(options);
  }

  /** Generate a plain QR code with no options object. */
  generateSimple(
    data:      string,
    size       = 300,
    darkColor  = '#000000',
    lightColor = '#FFFFFF',
  ): string {
    return this._gen.generateSimple(data, size, darkColor, lightColor);
  }

  // ── Static-image decode ────────────────────────────────────────────────────

  /**
   * Decode a QR code from a still image.
   * See {@link MidQrGenerator.decode} for accepted source types.
   */
  decode(
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
    return this._gen.decode(source);
  }

  /** Convert RGBA → luma using nimiq-compatible weights. */
  rgbaToLuma(rgba: Uint8Array | Uint8ClampedArray): Uint8Array {
    return this._gen.rgbaToLuma(rgba);
  }

  // ── Camera scanner ─────────────────────────────────────────────────────────

  /**
   * Create a real-time camera scanner.
   *
   * The scanner is independent of the generator — multiple scanner instances
   * can run simultaneously on different video elements.
   */
  createScanner(
    video:    HTMLVideoElement,
    onDecode: OnDecodeCallback,
    options?: ScannerOptions,
    onError?: OnDecodeErrorCallback,
  ): Promise<MidQrScanner> {
    return MidQrScanner.create(video, onDecode, options, onError);
  }

  /** Check whether the device has a camera. */
  static hasCamera(): Promise<boolean> {
    return MidQrScanner.hasCamera();
  }

  /** List all available cameras. */
  static listCameras(): Promise<CameraInfo[]> {
    return MidQrScanner.listCameras();
  }

  // ── Info ───────────────────────────────────────────────────────────────────

  /** Library version string. */
  get version(): string {
    return this._gen.version;
  }

  /**
   * Status object — useful for diagnostics and feature-detection UI.
   */
  get status(): MidQrStatus {
    return {
      wasmLoaded:           true, // if we constructed, WASM is loaded
      version:              this._gen.version,
      nativeBarcodeDetector:
        typeof window !== 'undefined' &&
        'BarcodeDetector' in window,
    };
  }
}
