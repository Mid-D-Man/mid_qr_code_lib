// =============================================================================
// mid-qr — Generator + static-image decode
//
// Generation: Rust WASM (mid_qr_wasm)
// Decode:     nimiq QrScanner.scanImage()
// =============================================================================
import { getQrScannerClass } from './utils.js';
// ── Lazy WASM init ────────────────────────────────────────────────────────────
let _wasm = null;
let _initPromise = null;
async function ensureWasm(wasmUrl) {
    if (_wasm !== null)
        return _wasm;
    if (_initPromise !== null)
        return _initPromise;
    _initPromise = (async () => {
        const mod = (await import('../wasm/mid_qr_wasm.js'));
        if (wasmUrl !== undefined) {
            await mod.default(wasmUrl);
        }
        else {
            await mod.default();
        }
        _wasm = mod;
        return mod;
    })();
    return _initPromise;
}
// ── WASM trap detection ───────────────────────────────────────────────────────
function isWasmTrap(e) {
    if (typeof WebAssembly === 'undefined')
        return false;
    return e instanceof WebAssembly.RuntimeError;
}
// ── Generator class ───────────────────────────────────────────────────────────
export class MidQrGenerator {
    constructor(wasm) {
        this._wasm = wasm;
    }
    // ── Factory ────────────────────────────────────────────────────────────────
    static async create(wasmUrl) {
        const wasm = await ensureWasm(wasmUrl);
        return new MidQrGenerator(wasm);
    }
    // ── Generation ─────────────────────────────────────────────────────────────
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
    generate(options) {
        if (!options.data || options.data.trim().length === 0) {
            throw new Error('mid-qr: data cannot be empty');
        }
        try {
            return this._wasm.generate({
                data: options.data,
                size: options.size ?? 300,
                darkColor: options.darkColor ?? '#000000',
                lightColor: options.lightColor ?? '#FFFFFF',
                errorLevel: options.errorLevel ?? 'M',
                margin: options.margin ?? true,
                // Optional blocks — send undefined rather than null so serde
                // sees a missing field (= None) instead of a null (= type error).
                gradient: options.gradient ?? undefined,
                logo: options.logo ?? undefined,
                moduleStyle: options.moduleStyle ?? undefined,
                cornerSquareStyle: options.cornerSquareStyle ?? undefined,
                cornerDotStyle: options.cornerDotStyle ?? undefined,
                eyeColor: options.eyeColor ?? undefined,
                frame: options.frame
                    ? {
                        style: options.frame.style,
                        color: options.frame.color,
                        text: options.frame.text ?? 'Scan Me!',
                        textColor: options.frame.textColor ?? '#ffffff',
                    }
                    : undefined,
            });
        }
        catch (e) {
            if (isWasmTrap(e)) {
                throw new Error('mid-qr: generation failed — data may be too long for the chosen error level');
            }
            throw e;
        }
    }
    /**
     * Quick-generate a plain black-on-white QR code with no style options.
     * Useful for server-side or batch scenarios where options aren't needed.
     */
    generateSimple(data, size = 300, darkColor = '#000000', lightColor = '#FFFFFF') {
        try {
            return this._wasm.generateSimple(data, size, darkColor, lightColor);
        }
        catch (e) {
            if (isWasmTrap(e))
                throw new Error('mid-qr: generation failed internally');
            throw e;
        }
    }
    // ── Static-image decode ────────────────────────────────────────────────────
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
    async decode(source) {
        const QrScanner = getQrScannerClass();
        try {
            const result = await QrScanner.scanImage(source, {
                returnDetailedScanResult: true,
            });
            return result.data;
        }
        catch (err) {
            if (err === QrScanner.NO_QR_CODE_FOUND ||
                String(err).includes('No QR code') ||
                String(err).includes('No QR')) {
                throw new Error('mid-qr: no QR code found in image. ' +
                    'Ensure the image contains a clear, complete QR code.');
            }
            throw err;
        }
    }
    // ── Capability queries ─────────────────────────────────────────────────────
    /**
     * Return all supported option values as typed arrays.
     * Useful for building UI pickers without hard-coding the lists.
     *
     * ```ts
     * const { moduleStyles } = qr.getCapabilities();
     * // ['square', 'dot', 'rounded', 'extra-rounded', 'classy', 'classy-rounded']
     * ```
     */
    getCapabilities() {
        const csv = (fn) => fn().split(',').filter(Boolean);
        return {
            errorLevels: csv(() => this._wasm.getSupportedErrorLevels()),
            gradientDirections: csv(() => this._wasm.getSupportedGradientDirections()),
            moduleStyles: csv(() => this._wasm.getSupportedModuleStyles()),
            cornerSquareStyles: csv(() => this._wasm.getSupportedCornerSquareStyles()),
            cornerDotStyles: csv(() => this._wasm.getSupportedCornerDotStyles()),
            // format: "0:none,1:square-below,..." — extract the numeric index
            frameStyles: csv(() => this._wasm.getSupportedFrameStyles())
                .map(s => parseInt(s.split(':')[0], 10))
                .filter(n => !isNaN(n)),
        };
    }
    // ── Info ───────────────────────────────────────────────────────────────────
    get version() {
        return this._wasm.getVersion();
    }
    get supportedErrorLevels() {
        return this._wasm.getSupportedErrorLevels();
    }
    get supportedGradientDirections() {
        return this._wasm.getSupportedGradientDirections();
    }
    get supportedModuleStyles() {
        return this._wasm.getSupportedModuleStyles();
    }
    get supportedCornerSquareStyles() {
        return this._wasm.getSupportedCornerSquareStyles();
    }
    get supportedCornerDotStyles() {
        return this._wasm.getSupportedCornerDotStyles();
    }
}
