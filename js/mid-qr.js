// =============================================================================
// mid-qr — shared nimiq QrScanner resolution
// Both generator.ts (static decode) and scanner.ts (camera scan) use this.
// QrScanner must be loaded via <script src="qr-scanner.umd.min.js"> BEFORE
// any module script.  The UMD build sets window.QrScanner and correctly
// resolves qr-scanner-worker.min.js relative to its own URL.
// =============================================================================
// ── Cache ─────────────────────────────────────────────────────────────────────
let _qrScannerClass = null;
// ── Resolvers ─────────────────────────────────────────────────────────────────
/**
 * Resolve `window.QrScanner` set by the UMD script tag.
 * Throws with a clear message if the script was not loaded.
 */
function getQrScannerClass() {
    if (_qrScannerClass)
        return _qrScannerClass;
    const win = typeof window !== 'undefined'
        ? window
        : null;
    if (win?.['QrScanner']) {
        _qrScannerClass = win['QrScanner'];
        return _qrScannerClass;
    }
    throw new Error('mid-qr: QrScanner not found on window.\n' +
        'Add the following tag BEFORE your <script type="module"> in your HTML:\n' +
        '  <script src="path/to/qr-scanner.umd.min.js"></script>\n' +
        'The UMD build sets window.QrScanner and resolves the worker correctly.');
}

// =============================================================================
// mid-qr — Generator + static-image decode
//
// Generation: Rust WASM (mid_qr_wasm)
// Decode:     nimiq QrScanner.scanImage()
// =============================================================================
// ── Lazy WASM init ────────────────────────────────────────────────────────────
let _wasm = null;
let _initPromise = null;
async function ensureWasm(wasmUrl) {
    if (_wasm !== null)
        return _wasm;
    if (_initPromise !== null)
        return _initPromise;
    _initPromise = (async () => {
        const mod = (await Promise.resolve().then(function () { return mid_qr_wasm; }));
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
class MidQrGenerator {
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

// =============================================================================
// mid-qr — Real-time camera scanner
//
// Wraps nimiq QrScanner (loaded as UMD via <script> tag).
// Uses window.QrScanner resolved by getQrScannerClass() from utils.ts.
// =============================================================================
// ── Default scan region ───────────────────────────────────────────────────────
function defaultScanRegion(video) {
    const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.80);
    return {
        x: Math.round((video.videoWidth - size) / 2),
        y: Math.round((video.videoHeight - size) / 2),
        width: size,
        height: size,
    };
}
// ── MidQrScanner ──────────────────────────────────────────────────────────────
class MidQrScanner {
    constructor(inner, video, cameras, onDecode, onError) {
        this._scanning = false;
        this._cameraIdx = 0;
        this._inner = inner;
        this._video = video;
        this._cameras = cameras;
        this._onDecode = onDecode;
        this._onError = onError;
    }
    static async create(video, onDecode, options, onError) {
        // Resolve the class — throws with a clear message if UMD not loaded
        const QrScanner = getQrScannerClass();
        const cameras = await QrScanner.listCameras(true).catch(() => []);
        const preferred = options?.preferredCamera ?? 'environment';
        let startCamera = preferred;
        // If a specific deviceId is passed, verify it exists
        if (preferred !== 'environment' && preferred !== 'user') {
            const found = cameras.find(c => c.id === preferred);
            startCamera = found?.id ?? 'environment';
        }
        let startIdx = 0;
        if (cameras.length > 0) {
            const envIdx = cameras.findIndex(c => /back|rear|environment/i.test(c.label));
            if (preferred === 'environment' && envIdx >= 0)
                startIdx = envIdx;
        }
        const inner = new QrScanner(video, nimiqResult => onDecode({
            data: nimiqResult.data,
            cornerPoints: nimiqResult.cornerPoints,
        }), {
            preferredCamera: startCamera,
            maxScansPerSecond: options?.maxScansPerSecond ?? 5,
            highlightScanRegion: options?.highlightScanRegion ?? false,
            highlightCodeOutline: options?.highlightCodeOutline ?? false,
            returnDetailedScanResult: true,
            onDecodeError: onError ?? (() => { }),
            calculateScanRegion: defaultScanRegion,
        });
        const instance = new MidQrScanner(inner, video, cameras, onDecode, onError);
        instance._cameraIdx = startIdx;
        return instance;
    }
    // ── Control ────────────────────────────────────────────────────────────────
    async start() {
        await this._inner.start();
        this._scanning = true;
        // Request higher resolution from the camera track when possible
        const stream = this._video.srcObject;
        if (stream instanceof MediaStream) {
            const track = stream.getVideoTracks()[0];
            if (track?.applyConstraints) {
                try {
                    await track.applyConstraints({
                        width: { ideal: 1920, min: 1280 },
                        height: { ideal: 1080, min: 720 },
                    });
                }
                catch { /* non-fatal — lower resolution still scans */ }
            }
        }
    }
    stop() {
        this._inner.stop();
        this._scanning = false;
    }
    destroy() {
        this._inner.destroy();
        this._scanning = false;
    }
    async switchCamera() {
        if (this._cameras.length <= 1)
            return;
        const wasScanning = this._scanning;
        if (wasScanning)
            this._inner.stop();
        this._cameraIdx = (this._cameraIdx + 1) % this._cameras.length;
        await this._inner.setCamera(this._cameras[this._cameraIdx].id);
        if (wasScanning)
            await this._inner.start();
    }
    async setCameraById(deviceId) {
        const idx = this._cameras.findIndex(c => c.id === deviceId);
        if (idx === -1)
            throw new Error(`mid-qr: camera '${deviceId}' not found`);
        const wasScanning = this._scanning;
        if (wasScanning)
            this._inner.stop();
        this._cameraIdx = idx;
        await this._inner.setCamera(deviceId);
        if (wasScanning)
            await this._inner.start();
    }
    // ── Flash ──────────────────────────────────────────────────────────────────
    get flashOn() { return this._inner.isFlashOn(); }
    async hasFlash() { return this._inner.hasFlash(); }
    async toggleFlash() { return this._inner.toggleFlash(); }
    // ── State ──────────────────────────────────────────────────────────────────
    get isScanning() { return this._scanning; }
    get cameras() { return [...this._cameras]; }
    get currentCamera() { return this._cameras[this._cameraIdx]; }
    // ── Static helpers ─────────────────────────────────────────────────────────
    static async hasCamera() {
        try {
            return await getQrScannerClass().hasCamera();
        }
        catch {
            return false;
        }
    }
    static async listCameras() {
        try {
            return await getQrScannerClass().listCameras(true).catch(() => []);
        }
        catch {
            return [];
        }
    }
}

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
class MidQr {
    constructor(gen) {
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
    static async create(wasmUrl) {
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
    generate(options) {
        return this._gen.generate(options);
    }
    /**
     * Quick-generate a plain QR code with no options object.
     * Dark/light colours default to black on white.
     */
    generateSimple(data, size = 300, darkColor = '#000000', lightColor = '#FFFFFF') {
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
    decode(source) {
        return this._gen.decode(source);
    }
    // ── Camera scanner ─────────────────────────────────────────────────────────
    /**
     * Create a real-time camera scanner attached to a `<video>` element.
     * Multiple independent instances can run simultaneously.
     */
    createScanner(video, onDecode, options, onError) {
        return MidQrScanner.create(video, onDecode, options, onError);
    }
    /** Returns `true` if at least one camera device is available. */
    static hasCamera() {
        return MidQrScanner.hasCamera();
    }
    /** List all available camera devices (requests labels if not yet granted). */
    static listCameras() {
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
    getCapabilities() {
        return this._gen.getCapabilities();
    }
    // ── Info ───────────────────────────────────────────────────────────────────
    /** Library version string from the WASM build. */
    get version() {
        return this._gen.version;
    }
    /** Diagnostic snapshot of the library's current state. */
    get status() {
        return {
            wasmLoaded: true,
            version: this._gen.version,
            nativeBarcodeDetector: typeof window !== 'undefined' && 'BarcodeDetector' in window,
        };
    }
}

let wasm;

const heap = new Array(128).fill(undefined);

heap.push(undefined, null, true, false);

function getObject(idx) { return heap[idx]; }

let WASM_VECTOR_LEN = 0;

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder('utf-8') : { encode: () => { throw Error('TextEncoder not available') } } );

const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
    return cachedTextEncoder.encodeInto(arg, view);
}
    : function (arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    view.set(buf);
    return {
        read: arg.length,
        written: buf.length
    };
});

function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }

    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = encodeString(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let heap_next = heap.length;

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
        return  `${val}`;
    }
    if (type == 'string') {
        return `"${val}"`;
    }
    if (type == 'symbol') {
        const description = val.description;
        if (description == null) {
            return 'Symbol';
        } else {
            return `Symbol(${description})`;
        }
    }
    if (type == 'function') {
        const name = val.name;
        if (typeof name == 'string' && name.length > 0) {
            return `Function(${name})`;
        } else {
            return 'Function';
        }
    }
    // objects
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = '[';
        if (length > 0) {
            debug += debugString(val[0]);
        }
        for(let i = 1; i < length; i++) {
            debug += ', ' + debugString(val[i]);
        }
        debug += ']';
        return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches && builtInMatches.length > 1) {
        className = builtInMatches[1];
    } else {
        // Failed to match the standard '[object ClassName]'
        return toString.call(val);
    }
    if (className == 'Object') {
        // we're a user defined class or Object
        // JSON.stringify avoids problems with cycles, and is generally much
        // easier than looping through ownProperties of `val`.
        try {
            return 'Object(' + JSON.stringify(val) + ')';
        } catch (_) {
            return 'Object';
        }
    }
    // errors
    if (val instanceof Error) {
        return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
}

const cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true, fatal: true }) : { decode: () => { throw Error('TextDecoder not available') } } );

if (typeof TextDecoder !== 'undefined') { cachedTextDecoder.decode(); }
function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function dropObject(idx) {
    if (idx < 132) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
 * @param {Uint8Array} rgba
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function decodeRgba(rgba, width, height) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.decodeRgba(retptr, ptr0, len0, width, height);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {string}
 */
function getVersion() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getVersion(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
function getSupportedCornerDotStyles() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedCornerDotStyles(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {Uint8Array} luma
 * @param {number} width
 * @param {number} height
 * @returns {string}
 */
function decodeLuma(luma, width, height) {
    let deferred3_0;
    let deferred3_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(luma, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.decodeLuma(retptr, ptr0, len0, width, height);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr2 = r0;
        var len2 = r1;
        if (r3) {
            ptr2 = 0; len2 = 0;
            throw takeObject(r2);
        }
        deferred3_0 = ptr2;
        deferred3_1 = len2;
        return getStringFromWasm0(ptr2, len2);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred3_0, deferred3_1, 1);
    }
}

/**
 * @returns {string}
 */
function getSupportedModuleStyles() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedModuleStyles(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

function init() {
    wasm.init();
}

/**
 * @returns {string}
 */
function getSupportedCornerSquareStyles() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedCornerSquareStyles(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
function getSupportedGradientDirections() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedGradientDirections(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
function getSupportedFrameStyles() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedFrameStyles(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @returns {string}
 */
function getSupportedErrorLevels() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.getSupportedErrorLevels(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred1_0, deferred1_1, 1);
    }
}

/**
 * @param {string} data
 * @param {number} size
 * @param {string} dark_color
 * @param {string} light_color
 * @returns {string}
 */
function generateSimple(data, size, dark_color, light_color) {
    let deferred5_0;
    let deferred5_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passStringToWasm0(data, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(dark_color, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(light_color, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        const len2 = WASM_VECTOR_LEN;
        wasm.generateSimple(retptr, ptr0, len0, size, ptr1, len1, ptr2, len2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr4 = r0;
        var len4 = r1;
        if (r3) {
            ptr4 = 0; len4 = 0;
            throw takeObject(r2);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred5_0, deferred5_1, 1);
    }
}

/**
 * @param {any} options
 * @returns {string}
 */
function generate(options) {
    let deferred2_0;
    let deferred2_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.generate(retptr, addHeapObject(options));
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
        var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
        var ptr1 = r0;
        var len1 = r1;
        if (r3) {
            ptr1 = 0; len1 = 0;
            throw takeObject(r2);
        }
        deferred2_0 = ptr1;
        deferred2_1 = len1;
        return getStringFromWasm0(ptr1, len1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export_2(deferred2_0, deferred2_1, 1);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}
/**
 * @param {Uint8Array} rgba
 * @returns {Uint8Array}
 */
function rgbaToLuma(rgba) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray8ToWasm0(rgba, wasm.__wbindgen_export_0);
        const len0 = WASM_VECTOR_LEN;
        wasm.rgbaToLuma(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayU8FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export_2(r0, r1 * 1, 1);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

function __wbg_get_imports() {
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbg_String_8f0eb39a4a4c2f66 = function(arg0, arg1) {
        const ret = String(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbg_buffer_609cc3eee51ed158 = function(arg0) {
        const ret = getObject(arg0).buffer;
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_getwithrefkey_1dc361bd10053bfe = function(arg0, arg1) {
        const ret = getObject(arg0)[getObject(arg1)];
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_instanceof_ArrayBuffer_e14585432e3737fc = function(arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof ArrayBuffer;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_instanceof_Uint8Array_17156bcf118086a9 = function(arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Uint8Array;
        } catch (_) {
            result = false;
        }
        const ret = result;
        return ret;
    };
    imports.wbg.__wbg_isSafeInteger_343e2beeeece1bb0 = function(arg0) {
        const ret = Number.isSafeInteger(getObject(arg0));
        return ret;
    };
    imports.wbg.__wbg_length_a446193dc22c12f8 = function(arg0) {
        const ret = getObject(arg0).length;
        return ret;
    };
    imports.wbg.__wbg_new_a12002a7f91c75be = function(arg0) {
        const ret = new Uint8Array(getObject(arg0));
        return addHeapObject(ret);
    };
    imports.wbg.__wbg_set_65595bdd868b3009 = function(arg0, arg1, arg2) {
        getObject(arg0).set(getObject(arg1), arg2 >>> 0);
    };
    imports.wbg.__wbindgen_as_number = function(arg0) {
        const ret = +getObject(arg0);
        return ret;
    };
    imports.wbg.__wbindgen_boolean_get = function(arg0) {
        const v = getObject(arg0);
        const ret = typeof(v) === 'boolean' ? (v ? 1 : 0) : 2;
        return ret;
    };
    imports.wbg.__wbindgen_debug_string = function(arg0, arg1) {
        const ret = debugString(getObject(arg1));
        const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        const len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_error_new = function(arg0, arg1) {
        const ret = new Error(getStringFromWasm0(arg0, arg1));
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_in = function(arg0, arg1) {
        const ret = getObject(arg0) in getObject(arg1);
        return ret;
    };
    imports.wbg.__wbindgen_is_object = function(arg0) {
        const val = getObject(arg0);
        const ret = typeof(val) === 'object' && val !== null;
        return ret;
    };
    imports.wbg.__wbindgen_is_undefined = function(arg0) {
        const ret = getObject(arg0) === undefined;
        return ret;
    };
    imports.wbg.__wbindgen_jsval_loose_eq = function(arg0, arg1) {
        const ret = getObject(arg0) == getObject(arg1);
        return ret;
    };
    imports.wbg.__wbindgen_memory = function() {
        const ret = wasm.memory;
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_number_get = function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof(obj) === 'number' ? obj : undefined;
        getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
    };
    imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        const ret = getObject(arg0);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    };
    imports.wbg.__wbindgen_string_get = function(arg0, arg1) {
        const obj = getObject(arg1);
        const ret = typeof(obj) === 'string' ? obj : undefined;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export_0, wasm.__wbindgen_export_1);
        var len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
        getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
    };
    imports.wbg.__wbindgen_string_new = function(arg0, arg1) {
        const ret = getStringFromWasm0(arg0, arg1);
        return addHeapObject(ret);
    };
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    return imports;
}

function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    __wbg_init.__wbindgen_wasm_module = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;


    wasm.__wbindgen_start();
    return wasm;
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (typeof module !== 'undefined') {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module);
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead');
        }
    }

    const imports = __wbg_get_imports();

    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }

    const instance = new WebAssembly.Instance(module, imports);

    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (typeof module_or_path !== 'undefined') {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path);
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead');
        }
    }

    if (typeof module_or_path === 'undefined') {
        module_or_path = new URL('mid_qr_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

var mid_qr_wasm = /*#__PURE__*/Object.freeze({
    __proto__: null,
    decodeLuma: decodeLuma,
    decodeRgba: decodeRgba,
    default: __wbg_init,
    generate: generate,
    generateSimple: generateSimple,
    getSupportedCornerDotStyles: getSupportedCornerDotStyles,
    getSupportedCornerSquareStyles: getSupportedCornerSquareStyles,
    getSupportedErrorLevels: getSupportedErrorLevels,
    getSupportedFrameStyles: getSupportedFrameStyles,
    getSupportedGradientDirections: getSupportedGradientDirections,
    getSupportedModuleStyles: getSupportedModuleStyles,
    getVersion: getVersion,
    init: init,
    initSync: initSync,
    rgbaToLuma: rgbaToLuma
});

export { MidQr, MidQrGenerator, MidQrScanner };
//# sourceMappingURL=index.js.map
