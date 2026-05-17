export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';
export type GradientDirection = 'linear-x' | 'linear-y' | 'diagonal' | 'radial';
/**
 * Shape applied to every data module (the individual QR "dots").
 *
 * | Value           | Effect                                              |
 * |-----------------|-----------------------------------------------------|
 * | `square`        | Sharp-cornered rectangles (default)                 |
 * | `dot`           | Filled circles (~90 % of module size)               |
 * | `rounded`       | Rectangles with 25 % corner radius                  |
 * | `extra-rounded` | Rectangles with 45 % corner radius (almost circles) |
 * | `classy`        | Square but top-right + bottom-left corners rounded  |
 * | `classy-rounded`| Like `classy` with 32 % uniform rounding            |
 */
export type ModuleStyle = 'square' | 'dot' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded';
/**
 * Shape of the outer 7×7 ring of each finder-pattern eye.
 *
 * | Value           | Effect                        |
 * |-----------------|-------------------------------|
 * | `square`        | Sharp rectangle (default)     |
 * | `extra-rounded` | Heavily rounded rectangle     |
 * | `dot`           | Concentric circles            |
 */
export type CornerSquareStyle = 'square' | 'extra-rounded' | 'dot';
/**
 * Shape of the inner 3×3 dot of each finder-pattern eye.
 *
 * | Value    | Effect              |
 * |----------|---------------------|
 * | `square` | Filled square (default) |
 * | `dot`    | Filled circle       |
 */
export type CornerDotStyle = 'square' | 'dot';
export interface GradientOptions {
    direction?: GradientDirection;
    /** CSS color for gradient start. */
    color1: string;
    /** CSS color for gradient end. */
    color2: string;
}
export interface LogoBorderOptions {
    /** CSS color for the border stroke. */
    color: string;
    /** Stroke width in SVG pixels.  Default: 2 */
    width?: number;
    /** Corner radius in SVG pixels.  Default: none */
    radius?: number;
}
export interface LogoOptions {
    /**
     * URL or data-URI of the logo image.
     * For data-URIs prefer PNG or SVG for crispness.
     */
    url: string;
    /**
     * Logo width/height as a fraction of the QR code's shorter side.
     * Clamped to 0.10–0.35 internally.  Default: 0.25
     */
    sizeRatio?: number;
    border?: LogoBorderOptions;
}
/**
 * Independent colours for the two visual parts of each finder-pattern eye.
 * When omitted, eyes inherit the dark colour (or gradient, if one is set).
 */
export interface EyeColorOptions {
    /** Colour of the outer 7×7 ring. */
    outer: string;
    /** Colour of the inner 3×3 dot. */
    inner: string;
}
/**
 * Decorative frame rendered around the QR code.
 *
 * | style | Description                                   |
 * |-------|-----------------------------------------------|
 * | 0     | No frame (default)                            |
 * | 1     | Solid square background, label below QR       |
 * | 2     | Rounded background, label below QR            |
 * | 3     | Solid square background, label above QR       |
 * | 4     | Rounded background, label above QR            |
 * | 5     | Square border + rounded badge tab below QR    |
 * | 6     | Rounded border + rounded badge tab below QR   |
 * | 7     | Thick square border only (no label area)      |
 * | 8     | Double square border (no label area)          |
 */
export interface FrameOptions {
    style: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
    /** CSS color for the frame background / border. */
    color: string;
    /**
     * Label text rendered in the frame area.
     * Ignored for styles 7 and 8.
     * Default (when omitted): "Scan Me!"
     */
    text?: string;
    /** CSS color for the label text.  Default: "#ffffff" */
    textColor?: string;
}
export interface GenerateOptions {
    /** Content to encode.  Required. */
    data: string;
    /**
     * Desired output size in SVG pixels.
     * The renderer rounds up to fit whole modules so the actual SVG may be
     * slightly larger.  Default: 300
     */
    size?: number;
    /** CSS color for dark (data) modules.  Default: "#000000" */
    darkColor?: string;
    /** CSS color for light (background) modules.  Default: "#FFFFFF" */
    lightColor?: string;
    /**
     * Error-correction level.  Default: "M"
     * Use "H" when embedding a logo — the extra redundancy compensates for the
     * modules obscured by the image.
     */
    errorLevel?: ErrorLevel;
    /**
     * Include the quiet zone (blank border around the QR code).
     * Disabling makes the code harder to scan.  Default: true
     */
    margin?: boolean;
    /** Gradient fill applied to dark modules (and eyes, unless eyeColor is set). */
    gradient?: GradientOptions;
    /**
     * Logo embedded at the centre of the QR code.
     * Requires errorLevel "H".
     */
    logo?: LogoOptions;
    /** Shape of every data module.  Default: "square" */
    moduleStyle?: ModuleStyle;
    /** Shape of the outer ring of the three finder-pattern eyes.  Default: "square" */
    cornerSquareStyle?: CornerSquareStyle;
    /** Shape of the inner dot of the three finder-pattern eyes.  Default: "square" */
    cornerDotStyle?: CornerDotStyle;
    /**
     * Independent colours for finder-pattern eyes.
     * When omitted, eyes use darkColor (or the gradient if one is set).
     */
    eyeColor?: EyeColorOptions;
    /** Decorative frame around the QR code.  Default: no frame (style 0). */
    frame?: FrameOptions;
}
export interface ScannerOptions {
    /**
     * Preferred camera.
     * "environment" = rear (default), "user" = front, or a specific deviceId.
     */
    preferredCamera?: 'environment' | 'user' | string;
    /**
     * Frames to attempt per second.  Lower values save CPU/battery.
     * Default: 5
     */
    maxScansPerSecond?: number;
    /** Highlight the scan region with an SVG overlay.  Default: false */
    highlightScanRegion?: boolean;
    /** Highlight the detected code outline.  Default: false */
    highlightCodeOutline?: boolean;
}
export interface ScanResult {
    /** Decoded text content of the QR code. */
    data: string;
    /** Corner points of the detected QR code in the video frame (pixels). */
    cornerPoints: Array<{
        x: number;
        y: number;
    }>;
}
export type OnDecodeCallback = (result: ScanResult) => void;
export type OnDecodeErrorCallback = (error: Error | string) => void;
export interface CameraInfo {
    id: string;
    label: string;
}
export interface MidQrStatus {
    wasmLoaded: boolean;
    version: string;
    nativeBarcodeDetector: boolean;
}
export interface MidQrCapabilities {
    errorLevels: ErrorLevel[];
    gradientDirections: GradientDirection[];
    moduleStyles: ModuleStyle[];
    cornerSquareStyles: CornerSquareStyle[];
    cornerDotStyles: CornerDotStyle[];
    frameStyles: number[];
}
