// =============================================================================
// mid-qr — Public API entry point
//
// import { MidQr }          from 'mid-qr';  // combined facade (recommended)
// import { MidQrGenerator } from 'mid-qr';  // generation + static decode only
// import { MidQrScanner }   from 'mid-qr';  // camera scanning only
//
// REQUIRED: load the nimiq UMD bundle before your module script:
//   <script src="path/to/qr-scanner.umd.min.js"></script>
//
// This sets window.QrScanner which both MidQrGenerator.decode() and
// MidQrScanner use internally.
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
  // New style option types
  ModuleStyle,
  CornerSquareStyle,
  CornerDotStyle,
  EyeColorOptions,
  FrameOptions,
  // Scanner types
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  // Status / capability types
  MidQrStatus,
  MidQrCapabilities,
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
  MidQrCapabilities,
} from './types.js';

/**
 * Combined facade — generation, static decode, and camera scanning
 * through a single object.
 *
 * ```ts
 * const qr = await MidQr.create(new URL('/wasm/mid_qr_wasm_bg.wasm', location.origin));
 *
 * // ── Style options ─────────────────────────────────────────────────────────
 *
 * // Dot modules + diagonal gradient
 * const svg = qr.generate({
 *   data:              'https://example.com',
 *   size:              320,
 *   moduleStyle:       'dot',
 *   cornerSquareStyle: 'extra-rounded',
 *   cornerDotStyle:    'dot',
 *   gradient: { direction: 'diagonal', color1: '#e63946', color2: '#2563eb' },
 * });
 *
 * // Custom eye colours
 * const svg2 = qr.generate({
 *   data:      'https://example.com',
 *   eyeColor:  { outer: '#e63946', inner: '#2563eb' },
 * });
 *
 * // Frame with label
 * const svg3 = qr.generate({
 *   data:  'https://example.com',
 *   frame: { style: 2, color: '#1a1a2e', text: 'Scan Me!', textColor: '#ffffff' },
 * });
 *
 * // ── Decode ────────────────────────────────────────────────────────────────
 * const text = await qr.decode(fileInput.files[0]);
 *
 * // ── Camera scanning ───────────────────────────────────────────────────────
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
   * Initialise the WASM module and return a ready-to-use `MidQr` instance.
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

  /**
   * Generate a QR code SVG string.
   *
   * All style fields (`moduleStyle`, `cornerSquareStyle`, `cornerDotStyle`,
   * `eyeColor`, `frame`) are optional and default to the plain square style.
   */
  generate(options: GenerateOptions): string {
    return this._gen.generate(options);
  }

  /**
   * Quick-generate a plain QR code with no options object.
   * Dark/light colours default to black on white.
   */
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
   * Requires `qr-scanner.umd.min.js` loaded via `<script>` tag.
   */
  decode(source: QrScannerSource): Promise<string> {
    return this._gen.decode(source);
  }

  // ── Camera scanner ─────────────────────────────────────────────────────────

  /**
   * Create a real-time camera scanner attached to a `<video>` element.
   * Multiple independent instances can run simultaneously.
   */
  createScanner(
    video:    HTMLVideoElement,
    onDecode: OnDecodeCallback,
    options?: ScannerOptions,
    onError?: OnDecodeErrorCallback,
  ): Promise<MidQrScanner> {
    return MidQrScanner.create(video, onDecode, options, onError);
  }

  /** Returns `true` if at least one camera device is available. */
  static hasCamera(): Promise<boolean> {
    return MidQrScanner.hasCamera();
  }

  /** List all available camera devices (requests labels if not yet granted). */
  static listCameras(): Promise<CameraInfo[]> {
    return MidQrScanner.listCameras();
  }

  // ── Capabilities ───────────────────────────────────────────────────────────

  /**
   * Return all supported option value sets as typed arrays.
   *
   * Use this to drive UI pickers (style selectors, gradient direction
   * dropdowns, frame style grids, etc.) without hard-coding the lists.
   *
   * ```ts
   * const caps = qr.getCapabilities();
   * caps.moduleStyles        // ['square','dot','rounded',...]
   * caps.cornerSquareStyles  // ['square','extra-rounded','dot']
   * caps.frameStyles         // [0,1,2,3,4,5,6,7,8]
   * ```
   */
  getCapabilities(): MidQrCapabilities {
    return this._gen.getCapabilities();
  }

  // ── Info ───────────────────────────────────────────────────────────────────

  /** Library version string from the WASM build. */
  get version(): string {
    return this._gen.version;
  }

  /** Diagnostic snapshot of the library's current state. */
  get status(): MidQrStatus {
    return {
      wasmLoaded:            true,
      version:               this._gen.version,
      nativeBarcodeDetector:
        typeof window !== 'undefined' && 'BarcodeDetector' in window,
    };
  }
}
