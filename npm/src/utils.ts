// =============================================================================
// mid-qr — shared nimiq QrScanner resolution
// Both generator.ts (static decode) and scanner.ts (camera scan) use this.
// QrScanner must be loaded via <script src="qr-scanner.umd.min.js"> BEFORE
// any module script.  The UMD build sets window.QrScanner and correctly
// resolves qr-scanner-worker.min.js relative to its own URL.
// =============================================================================

// ── Full nimiq interface ──────────────────────────────────────────────────────

export interface QrScannerInstance {
  start(): Promise<void>;
  stop(): void;
  destroy(): void;
  setCamera(facingModeOrDeviceId: string): Promise<void>;
  isFlashOn(): boolean;
  hasFlash(): Promise<boolean>;
  toggleFlash(): Promise<void>;
  readonly $video: HTMLVideoElement;
}

export type QrScannerSource =
  | File | Blob | URL | string
  | HTMLImageElement | HTMLCanvasElement | SVGImageElement
  | HTMLVideoElement | OffscreenCanvas | ImageBitmap;

export interface QrScannerResult {
  data: string;
  cornerPoints: Array<{ x: number; y: number }>;
}

export interface QrScannerStatic {
  new(
    video: HTMLVideoElement,
    onDecode: (result: QrScannerResult) => void,
    options: {
      preferredCamera?:          string;
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

  /**
   * Decode a QR code from any still-image source.
   * Uses BarcodeDetector when available, falls back to the nimiq worker.
   */
  scanImage(
    source: QrScannerSource,
    options: { returnDetailedScanResult: true; [key: string]: unknown }
  ): Promise<QrScannerResult>;

  listCameras(requestLabels?: boolean): Promise<Array<{ id: string; label: string }>>;
  hasCamera(): Promise<boolean>;

  readonly NO_QR_CODE_FOUND: string;
  _disableBarcodeDetector: boolean;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let _qrScannerClass: QrScannerStatic | null = null;

// ── Resolvers ─────────────────────────────────────────────────────────────────

/**
 * Resolve `window.QrScanner` set by the UMD script tag.
 * Throws with a clear message if the script was not loaded.
 */
export function getQrScannerClass(): QrScannerStatic {
  if (_qrScannerClass) return _qrScannerClass;

  const win =
    typeof window !== 'undefined'
      ? (window as unknown as Record<string, unknown>)
      : null;

  if (win?.['QrScanner']) {
    _qrScannerClass = win['QrScanner'] as QrScannerStatic;
    return _qrScannerClass;
  }

  throw new Error(
    'mid-qr: QrScanner not found on window.\n' +
    'Add the following tag BEFORE your <script type="module"> in your HTML:\n' +
    '  <script src="path/to/qr-scanner.umd.min.js"></script>\n' +
    'The UMD build sets window.QrScanner and resolves the worker correctly.'
  );
}

/**
 * Like getQrScannerClass but returns null instead of throwing.
 * Use when QrScanner is optional.
 */
export function tryGetQrScannerClass(): QrScannerStatic | null {
  try {
    return getQrScannerClass();
  } catch {
    return null;
  }
  }
