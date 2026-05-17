import type { GenerateOptions, MidQrCapabilities } from './types.js';
import { type QrScannerSource } from './utils.js';
export declare class MidQrGenerator {
    private readonly _wasm;
    private constructor();
    static create(wasmUrl?: string | URL): Promise<MidQrGenerator>;
    /**
     * Generate a QR code SVG string from the supplied options.
     *
     * All style fields are optional — omitting them produces a standard
     * black-on-white square-module QR code.
     *
     * ```ts
     * // Dot modules, red-to-blue diagonal gradient, rounded eye corners
     * const svg = qr.generate({
     *   data:              'https://example.com',
     *   size:              300,
     *   moduleStyle:       'dot',
     *   cornerSquareStyle: 'extra-rounded',
     *   cornerDotStyle:    'dot',
     *   gradient: { direction: 'diagonal', color1: '#e63946', color2: '#2563eb' },
     * });
     * ```
     */
    generate(options: GenerateOptions): string;
    /**
     * Quick-generate a plain black-on-white QR code with no style options.
     * Useful for server-side or batch scenarios where options aren't needed.
     */
    generateSimple(data: string, size?: number, darkColor?: string, lightColor?: string): string;
    /**
     * Decode a QR code from a still image via nimiq QrScanner.scanImage().
     *
     * Accepted source types:
     *   File | Blob | URL | string (URL)
     *   HTMLImageElement | HTMLCanvasElement | SVGImageElement
     *   OffscreenCanvas | ImageBitmap | HTMLVideoElement
     *
     * Requires qr-scanner.umd.min.js loaded via `<script>` tag before any
     * `<script type="module">` in your HTML.
     */
    decode(source: QrScannerSource): Promise<string>;
    /**
     * Return all supported option values as typed arrays.
     * Useful for building UI pickers without hard-coding the lists.
     *
     * ```ts
     * const { moduleStyles } = qr.getCapabilities();
     * // ['square', 'dot', 'rounded', 'extra-rounded', 'classy', 'classy-rounded']
     * ```
     */
    getCapabilities(): MidQrCapabilities;
    get version(): string;
    get supportedErrorLevels(): string;
    get supportedGradientDirections(): string;
    get supportedModuleStyles(): string;
    get supportedCornerSquareStyles(): string;
    get supportedCornerDotStyles(): string;
}
