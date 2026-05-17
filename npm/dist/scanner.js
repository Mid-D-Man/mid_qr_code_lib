// =============================================================================
// mid-qr — Real-time camera scanner
//
// Wraps nimiq QrScanner (loaded as UMD via <script> tag).
// Uses window.QrScanner resolved by getQrScannerClass() from utils.ts.
// =============================================================================
import { getQrScannerClass } from './utils.js';
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
export class MidQrScanner {
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
