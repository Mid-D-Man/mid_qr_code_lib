import type {
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
} from './types.js';

// ── nimiq QrScanner type declaration ─────────────────────────────────────────
// The nimiq scanner ships as a minified JS file with no bundled .d.ts.
// We declare the shape we use here so TypeScript is satisfied without
// requiring a declaration file alongside the .js.

interface QrScannerStatic {
  new(
    video: HTMLVideoElement,
    onDecode: (result: { data: string; cornerPoints: Array<{ x: number; y: number }> }) => void,
    options: {
      preferredCamera?:         string;
      maxScansPerSecond?:        number;
      highlightScanRegion?:      boolean;
      highlightCodeOutline?:     boolean;
      returnDetailedScanResult:  true;
      onDecodeError?:            (err: Error | string) => void;
      calculateScanRegion?:      (video: HTMLVideoElement) => {
        x: number; y: number; width: number; height: number;
        downScaledWidth?: number; downScaledHeight?: number;
      };
    }
  ): QrScannerInstance;

  listCameras(requestLabels?: boolean): Promise<Array<{ id: string; label: string }>>;
  hasCamera(): Promise<boolean>;
}

interface QrScannerInstance {
  start(): Promise<void>;
  stop(): void;
  pause(stopStreamImmediately?: boolean): Promise<boolean>;
  destroy(): void;
  setCamera(facingModeOrDeviceId: string): Promise<void>;
  isFlashOn(): boolean;
  hasFlash(): Promise<boolean>;
  toggleFlash(): Promise<void>;
  readonly $video: HTMLVideoElement;
}

// ── Resolve QrScanner ─────────────────────────────────────────────────────────
// Supports both UMD (loaded via <script> tag — sets window.QrScanner)
// and ES module import (bundler / Node environments).

let _QrScannerClass: QrScannerStatic | null = null;

async function getQrScannerClass(): Promise<QrScannerStatic> {
  if (_QrScannerClass) return _QrScannerClass;

  // UMD bundle loaded via <script>
  const win = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>)
    : null;

  if (win?.['QrScanner']) {
    _QrScannerClass = win['QrScanner'] as QrScannerStatic;
    return _QrScannerClass;
  }

  // ES module — cast through unknown to avoid missing-declaration-file error.
  // The module satisfies QrScannerStatic at runtime.
  try {
    const mod = await import('./worker/qr-scanner.min.js') as unknown as { default: QrScannerStatic };
    _QrScannerClass = mod.default;
    return _QrScannerClass;
  } catch {
    throw new Error(
      'mid-qr: QrScanner not found. ' +
      'Load qr-scanner.umd.min.js via <script> or ensure npm/src/worker/ is bundled.',
    );
  }
}

// ── Default scan-region calculator ────────────────────────────────────────────

function defaultScanRegion(video: HTMLVideoElement) {
  const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.80);
  return {
    x:      Math.round((video.videoWidth  - size) / 2),
    y:      Math.round((video.videoHeight - size) / 2),
    width:  size,
    height: size,
  };
}

// ── MidQrScanner ──────────────────────────────────────────────────────────────

/**
 * Real-time camera QR code scanner backed by the nimiq qr-scanner library.
 *
 * ```ts
 * const scanner = await MidQrScanner.create(videoEl, result => console.log(result.data));
 * await scanner.start();
 * ```
 */
export class MidQrScanner {
  private readonly _inner:    QrScannerInstance;
  private readonly _video:    HTMLVideoElement;
  private readonly _cameras:  CameraInfo[];
  private readonly _onDecode: OnDecodeCallback;
  private readonly _onError:  OnDecodeErrorCallback | undefined;

  private _scanning  = false;
  private _cameraIdx = 0;

  private constructor(
    inner:    QrScannerInstance,
    video:    HTMLVideoElement,
    cameras:  CameraInfo[],
    onDecode: OnDecodeCallback,
    onError?: OnDecodeErrorCallback,
  ) {
    this._inner    = inner;
    this._video    = video;
    this._cameras  = cameras;
    this._onDecode = onDecode;
    this._onError  = onError;
  }

  // ── Factory ────────────────────────────────────────────────────────────────

  static async create(
    video:    HTMLVideoElement,
    onDecode: OnDecodeCallback,
    options?: ScannerOptions,
    onError?: OnDecodeErrorCallback,
  ): Promise<MidQrScanner> {
    const QrScanner = await getQrScannerClass();
    const cameras   = await QrScanner.listCameras(true).catch(() => []);

    const preferred   = options?.preferredCamera ?? 'environment';
    let   startCamera = preferred;

    if (preferred !== 'environment' && preferred !== 'user') {
      const found = cameras.find(c => c.id === preferred);
      startCamera = found?.id ?? 'environment';
    }

    let startIdx = 0;
    if (cameras.length > 0) {
      const envIdx = cameras.findIndex(c => /back|rear|environment/i.test(c.label));
      startIdx = preferred === 'environment'
        ? (envIdx >= 0 ? envIdx : 0)
        : 0;
    }

    const inner = new QrScanner(
      video,
      (nimiqResult) => {
        onDecode({ data: nimiqResult.data, cornerPoints: nimiqResult.cornerPoints });
      },
      {
        preferredCamera:           startCamera,
        maxScansPerSecond:         options?.maxScansPerSecond    ?? 5,
        highlightScanRegion:       options?.highlightScanRegion  ?? false,
        highlightCodeOutline:      options?.highlightCodeOutline ?? false,
        returnDetailedScanResult:  true,
        onDecodeError:             onError ?? (() => { /* silent */ }),
        calculateScanRegion:       defaultScanRegion,
      },
    );

    const instance    = new MidQrScanner(inner, video, cameras, onDecode, onError);
    instance._cameraIdx = startIdx;
    return instance;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async start(): Promise<void> {
    await this._inner.start();
    this._scanning = true;

    const stream = this._video.srcObject;
    if (stream instanceof MediaStream) {
      const track = stream.getVideoTracks()[0];
      if (track?.applyConstraints) {
        try {
          await track.applyConstraints({
            width:  { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720  },
          });
        } catch { /* non-fatal */ }
      }
    }
  }

  stop(): void {
    this._inner.stop();
    this._scanning = false;
  }

  destroy(): void {
    this._inner.destroy();
    this._scanning = false;
  }

  // ── Camera control ─────────────────────────────────────────────────────────

  async switchCamera(): Promise<void> {
    if (this._cameras.length <= 1) return;

    const wasScanning = this._scanning;
    if (wasScanning) this._inner.stop();

    this._cameraIdx = (this._cameraIdx + 1) % this._cameras.length;
    await this._inner.setCamera(this._cameras[this._cameraIdx].id);

    if (wasScanning) await this._inner.start();
  }

  async setCameraById(deviceId: string): Promise<void> {
    const idx = this._cameras.findIndex(c => c.id === deviceId);
    if (idx === -1) throw new Error(`mid-qr: camera '${deviceId}' not found`);

    const wasScanning = this._scanning;
    if (wasScanning) this._inner.stop();

    this._cameraIdx = idx;
    await this._inner.setCamera(deviceId);

    if (wasScanning) await this._inner.start();
  }

  // ── Flash ──────────────────────────────────────────────────────────────────

  get flashOn(): boolean           { return this._inner.isFlashOn(); }
  async hasFlash(): Promise<boolean>    { return this._inner.hasFlash(); }
  async toggleFlash(): Promise<void>    { return this._inner.toggleFlash(); }

  // ── State ──────────────────────────────────────────────────────────────────

  get isScanning(): boolean        { return this._scanning; }
  get cameras(): CameraInfo[]      { return [...this._cameras]; }
  get currentCamera(): CameraInfo | undefined { return this._cameras[this._cameraIdx]; }

  // ── Static utilities ───────────────────────────────────────────────────────

  static async hasCamera(): Promise<boolean> {
    const QrScanner = await getQrScannerClass();
    return QrScanner.hasCamera();
  }

  static async listCameras(): Promise<CameraInfo[]> {
    const QrScanner = await getQrScannerClass();
    return QrScanner.listCameras(true).catch(() => []);
  }
      }
