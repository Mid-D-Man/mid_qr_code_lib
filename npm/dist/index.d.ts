export { MidQrGenerator } from './generator.js';
export { MidQrScanner } from './scanner.js';
export type { GenerateOptions, GradientOptions, GradientDirection, LogoOptions, LogoBorderOptions, ErrorLevel, ModuleStyle, CornerSquareStyle, CornerDotStyle, EyeColorOptions, FrameOptions, ScannerOptions, ScanResult, OnDecodeCallback, OnDecodeErrorCallback, CameraInfo, MidQrStatus, MidQrCapabilities, } from './types.js';
import { MidQrScanner } from './scanner.js';
import type { QrScannerSource } from './utils.js';
import type { GenerateOptions, ScannerOptions, OnDecodeCallback, OnDecodeErrorCallback, CameraInfo, MidQrStatus, MidQrCapabilities } from './types.js';
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
export declare class MidQr {
    private readonly _gen;
    private constructor();
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
    static create(wasmUrl?: string | URL): Promise<MidQr>;
    /**
     * Generate a QR code SVG string.
     *
     * All style fields (`moduleStyle`, `cornerSquareStyle`, `cornerDotStyle`,
     * `eyeColor`, `frame`) are optional and default to the plain square style.
     */
    generate(options: GenerateOptions): string;
    /**
     * Quick-generate a plain QR code with no options object.
     * Dark/light colours default to black on white.
     */
    generateSimple(data: string, size?: number, darkColor?: string, lightColor?: string): string;
    /**
     * Decode a QR code from a still image via nimiq QrScanner.scanImage().
     *
     * Accepted sources: File | Blob | URL | string (URL)
     *   HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap
     *
     * Requires `qr-scanner.umd.min.js` loaded via `<script>` tag.
     */
    decode(source: QrScannerSource): Promise<string>;
    /**
     * Create a real-time camera scanner attached to a `<video>` element.
     * Multiple independent instances can run simultaneously.
     */
    createScanner(video: HTMLVideoElement, onDecode: OnDecodeCallback, options?: ScannerOptions, onError?: OnDecodeErrorCallback): Promise<MidQrScanner>;
    /** Returns `true` if at least one camera device is available. */
    static hasCamera(): Promise<boolean>;
    /** List all available camera devices (requests labels if not yet granted). */
    static listCameras(): Promise<CameraInfo[]>;
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
    getCapabilities(): MidQrCapabilities;
    /** Library version string from the WASM build. */
    get version(): string;
    /** Diagnostic snapshot of the library's current state. */
    get status(): MidQrStatus;
}
