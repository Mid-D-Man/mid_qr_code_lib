// =============================================================================
// mid-qr — Public type definitions
// All types exported from index.ts so consumers get a single import path.
// =============================================================================

// ── Generation ────────────────────────────────────────────────────────────────

export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

export type GradientDirection =
  | 'linear-x'
  | 'linear-y'
  | 'diagonal'
  | 'radial';

export interface GradientOptions {
  direction?: GradientDirection;
  /** CSS color for the gradient start. */
  color1: string;
  /** CSS color for the gradient end. */
  color2: string;
}

export interface LogoBorderOptions {
  /** CSS color for the border stroke. */
  color: string;
  /** Stroke width in SVG pixels. Default: 2 */
  width?: number;
  /** Corner radius in SVG pixels. Default: none */
  radius?: number;
}

export interface LogoOptions {
  /**
   * URL or data-URI of the logo image.
   * For data-URIs, prefer PNG or SVG for crispness.
   */
  url: string;
  /**
   * Logo width/height as a fraction of the QR code's shorter side.
   * Clamped to 0.10 – 0.35 internally.
   * Default: 0.25
   */
  sizeRatio?: number;
  border?: LogoBorderOptions;
}

export interface GenerateOptions {
  /** Content to encode. Required. */
  data: string;
  /**
   * Desired output size in SVG pixels.
   * The Rust renderer rounds up to fit whole modules, so the actual SVG
   * dimensions may be slightly larger.
   * Default: 300
   */
  size?: number;
  /** CSS color for the dark (data) modules.  Default: "#000000" */
  darkColor?: string;
  /** CSS color for the light (background) modules.  Default: "#FFFFFF" */
  lightColor?: string;
  /**
   * Error-correction level.  Default: "M"
   * Always use "H" when embedding a logo — the extra redundancy compensates
   * for the modules obscured by the logo.
   */
  errorLevel?: ErrorLevel;
  /**
   * Include the quiet zone (the blank border around the QR code).
   * Disabling this makes the code harder to scan in some readers.
   * Default: true
   */
  margin?: boolean;
  /** Apply a gradient fill to the dark modules. */
  gradient?: GradientOptions;
  /**
   * Embed a logo in the centre of the QR code.
   * Requires errorLevel "H".
   */
  logo?: LogoOptions;
}

// ── Scanning ──────────────────────────────────────────────────────────────────

export interface ScannerOptions {
  /**
   * Preferred camera.
   * "environment" = rear camera (default), "user" = front camera.
   * A specific deviceId string can also be passed.
   */
  preferredCamera?: 'environment' | 'user' | string;
  /**
   * How many frames to attempt to decode per second.
   * Lower values reduce CPU and battery use.
   * Default: 5
   */
  maxScansPerSecond?: number;
  /**
   * Highlight the scan region with an SVG overlay.
   * Default: false
   */
  highlightScanRegion?: boolean;
  /**
   * Highlight the detected code outline.
   * Default: false
   */
  highlightCodeOutline?: boolean;
}

export interface ScanResult {
  /** The decoded text content of the QR code. */
  data: string;
  /** Corner points of the detected QR code in the video frame (pixels). */
  cornerPoints: Array<{ x: number; y: number }>;
}

export type OnDecodeCallback = (result: ScanResult) => void;
export type OnDecodeErrorCallback = (error: Error | string) => void;

// ── Camera enumeration ────────────────────────────────────────────────────────

export interface CameraInfo {
  id: string;
  label: string;
}

// ── Module status ─────────────────────────────────────────────────────────────

export interface MidQrStatus {
  wasmLoaded: boolean;
  version: string;
  nativeBarcodeDetector: boolean;
}
