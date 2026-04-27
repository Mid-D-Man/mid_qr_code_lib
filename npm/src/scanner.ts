// =============================================================================
// mid-qr — Real-time camera scanner
//
// Decode path priority (per frame):
//   1. Native BarcodeDetector API (Chromium ≥ 83, no WASM overhead)
//   2. nimiq qr-scanner-worker (hand-tuned camera binarizer, MIT)
//
// The rxing WASM decoder is intentionally NOT used for camera frames because
// nimiq's binarizer outperforms it on motion-blurred and unevenly-lit frames.
//
// Multiple independent scanner instances are supported via ScannerManager.
// Each instance owns its own QrScanner and camera stream.
// =============================================================================

import type {
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
} from './types.js';

// ── nimiq QrScanner type shim ─────────────────────────────────────────────────
// The UMD bundle sets window.QrScanner.  In a bundler environment you can
// import the ES module directly — the shim keeps both paths working.

declare class QrScannerClass {
  constructor(
    video: HTMLVideoElement,
    onDecode: (result: { data: string; cornerPoints: Array<{ x: number; y: number }> }) => void,
    options: {
      preferredCamera?:     string;
      maxScansPerSecond?:   number;
      highlightScanRegion?: boolean;
      highlightCodeOutline?:boolean;
      returnDetailedScanResult: true;
      onDecodeError?: (err: Error | string) => void;
      calculateScanRegion?: (video: HTMLVideoElement) => {
        x: number; y: number; width: number; height: number;
        downScaledWidth?: number; downScaledHeight?: number;
      };
    }
  ): void;

  start(): Promise<void>;
  stop(): void;
  pause(stopStreamImmediately?: boolean): Promise<boolean>;
  destroy(): void;
  setCamera(facingModeOrDeviceId: string): Promise<void>;
  isFlashOn(): boolean;
  hasFlash(): Promise<boolean>;
  toggleFlash(): Promise<void>;

  static listCameras(requestLabels?: boolean): Promise<Array<{ id: string; label: string }>>;
  static hasCamera(): Promise<boolean>;

  readonly $video: HTMLVideoElement;
}

// Resolve QrScanner from window (UMD) or from the ES module import.
// We do this lazily at first-use so the module can be loaded server-side
// without crashing (SSR / Node test environments).
async function getQrScannerClass(): Promise<typeof QrScannerClass> {
  // Already on window (UMD bundle loaded via <script>)
  if (typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)['QrScanner']) {
    return (window as unknown as Record<string, unknown>)['QrScanner'] as typeof QrScannerClass;
  }

  // Try ES module import (bundler or Node)
  try {
    // Path resolves to the worker copy bundled alongside this package
    const mod = await import('./worker/qr-scanner.min.js') as { default: typeof QrScannerClass };
    return mod.default;
  } catch {
    throw new Error(
      'mid-qr: QrScanner not found. ' +
      'Either load qr-scanner.umd.min.js via <script> or ensure the ' +
      'npm/src/worker/ directory is bundled with your project.',
    );
  }
}

// ── Default scan-region calculator ───────────────────────────────────────────

function defaultScanRegion(video: HTMLVideoElement) {
  // 80 % of the shorter video dimension — leaves edge breathing room
  // while keeping enough frame for angled codes.
  const size = Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.80);
  return {
    x:      Math.round((video.videoWidth  - size) / 2),
    y:      Math.round((video.videoHeight - size) / 2),
    width:  size,
    height: size,
  };
}

// ── MidQrScanner ─────────────────────────────────────────────────────────────

/**
 * Real-time camera QR code scanner backed by the nimiq qr-scanner library.
 *
 * ```ts
 * const scanner = await MidQrScanner.create(
 *   videoEl,
 *   result => console.log(result.data)
 * );
 * await scanner.start();
 *
 * // Later:
 * scanner.stop();
 * scanner.destroy();
 * ```
 *
 * Multiple instances with different video elements are fully supported.
 * Each instance manages its own camera stream independently.
 */
export class MidQrScanner {
  private readonly _inner: QrScannerClass;
  private readonly _video: HTMLVideoElement;
  private readonly _onDecode: OnDecodeCallback;
  private readonly _onError: OnDecodeErrorCallback | undefined;
  private readonly _cameras: CameraInfo[];

  private _scanning   = false;
  private _cameraIdx  = 0;

  private constructor(
    inner:    QrScannerClass,
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

  /**
   * Create a scanner instance attached to the given video element.
   *
   * @param video     An `<video>` element (must be in the DOM).
   * @param onDecode  Called with the decoded result on every successful scan.
   * @param options   Optional tuning parameters.
   * @param onError   Called when a frame fails to decode.
   *                  Defaults to a silent handler — the scanner keeps running.
   */
  static async create(
    video:    HTMLVideoElement,
    onDecode: OnDecodeCallback,
    options?: ScannerOptions,
    onError?: OnDecodeErrorCallback,
  ): Promise<MidQrScanner> {
    const QrScanner = await getQrScannerClass();

    // Enumerate cameras before creating the scanner so we can find the
    // preferred one by label as well as by facingMode.
    const cameras = await QrScanner.listCameras(true).catch(() => []);

    // Choose starting camera
    const preferred = options?.preferredCamera ?? 'environment';
    let startCamera = preferred;
    if (preferred !== 'environment' && preferred !== 'user') {
      // treat as deviceId — verify it exists, fall back to environment
      const found = cameras.find(c => c.id === preferred);
      startCamera = found?.id ?? 'environment';
    }

    const inner = new QrScanner(
      video,
      (nimiqResult) => {
        onDecode({
          data:         nimiqResult.data,
          cornerPoints: nimiqResult.cornerPoints,
        });
      },
      {
        preferredCamera:       startCamera,
        maxScansPerSecond:     options?.maxScansPerSecond     ?? 5,
        highlightScanRegion:   options?.highlightScanRegion   ?? false,
        highlightCodeOutline:  options?.highlightCodeOutline  ?? false,
        returnDetailedScanResult: true,
        onDecodeError: onError ?? (() => { /* silent */ }),
        calculateScanRegion: defaultScanRegion,
      },
    );

    // Find initial camera index
    const envIdx = cameras.findIndex(
      c => /back|rear|environment/i.test(c.label),
    );
    const startIdx = envIdx >= 0 ? envIdx : 0;

    const instance = new MidQrScanner(inner, video, cameras, onDecode, onError);
    instance._cameraIdx = startIdx;
    return instance;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /**
   * Request camera permission and start scanning.
   * Resolves when the camera stream is active and the first frame is queued.
   *
   * @throws If the browser denies camera permission or no camera is found.
   */
  async start(): Promise<void> {
    await this._inner.start();
    this._scanning = true;

    // Request higher resolution constraints on the active track for
    // better decode quality on high-DPI devices.
    const stream = this._video.srcObject;
    if (stream instanceof MediaStream) {
      const track = stream.getVideoTracks()[0];
      if (track?.applyConstraints) {
        try {
          await track.applyConstraints({
            width:  { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720  },
          });
        } catch {
          // Constraint rejection is non-fatal — lower resolution still works.
        }
      }
    }
  }

  /**
   * Pause the scanner.
   * The camera stream is stopped after a 300 ms delay (nimiq default).
   * Call {@link start} to resume.
   */
  stop(): void {
    this._inner.stop();
    this._scanning = false;
  }

  /**
   * Stop the camera stream immediately and release all resources.
   * The instance cannot be reused after calling this.
   */
  destroy(): void {
    this._inner.destroy();
    this._scanning = false;
  }

  // ── Camera control ─────────────────────────────────────────────────────────

  /**
   * Switch to the next available camera (cycles through the list).
   * No-op if only one camera is available.
   */
  async switchCamera(): Promise<void> {
    if (this._cameras.length <= 1) return;

    const wasScanning = this._scanning;
    if (wasScanning) this._inner.stop();

    this._cameraIdx = (this._cameraIdx + 1) % this._cameras.length;
    const next = this._cameras[this._cameraIdx];

    await this._inner.setCamera(next.id);

    if (wasScanning) await this._inner.start();
  }

  /**
   * Switch to a specific camera by device ID.
   *
   * @throws If the provided ID is not in the enumerated camera list.
   */
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

  /** Whether flash/torch is currently on. */
  get flashOn(): boolean {
    return this._inner.isFlashOn();
  }

  /** Check whether the active camera has a flash/torch. */
  async hasFlash(): Promise<boolean> {
    return this._inner.hasFlash();
  }

  /** Toggle the flash/torch on or off. */
  async toggleFlash(): Promise<void> {
    return this._inner.toggleFlash();
  }

  // ── State ──────────────────────────────────────────────────────────────────

  /** Whether the scanner is currently running. */
  get isScanning(): boolean {
    return this._scanning;
  }

  /** List of all enumerated cameras (populated at construction time). */
  get cameras(): CameraInfo[] {
    return [...this._cameras];
  }

  /** The currently active camera, or `undefined` if none enumerated. */
  get currentCamera(): CameraInfo | undefined {
    return this._cameras[this._cameraIdx];
  }

  // ── Static utilities ───────────────────────────────────────────────────────

  /**
   * Check whether the device has at least one camera.
   * Useful for conditionally rendering a scan button.
   */
  static async hasCamera(): Promise<boolean> {
    const QrScanner = await getQrScannerClass();
    return QrScanner.hasCamera();
  }

  /**
   * List all available cameras.
   * Returns an empty array if camera enumeration is unavailable.
   */
  static async listCameras(): Promise<CameraInfo[]> {
    const QrScanner = await getQrScannerClass();
    return QrScanner.listCameras(true).catch(() => []);
  }
}
