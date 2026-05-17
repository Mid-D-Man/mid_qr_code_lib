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
export type QrScannerSource = File | Blob | URL | string | HTMLImageElement | HTMLCanvasElement | SVGImageElement | HTMLVideoElement | OffscreenCanvas | ImageBitmap;
export interface QrScannerResult {
    data: string;
    cornerPoints: Array<{
        x: number;
        y: number;
    }>;
}
export interface QrScannerStatic {
    new (video: HTMLVideoElement, onDecode: (result: QrScannerResult) => void, options: {
        preferredCamera?: string;
        maxScansPerSecond?: number;
        highlightScanRegion?: boolean;
        highlightCodeOutline?: boolean;
        returnDetailedScanResult: true;
        onDecodeError?: (err: Error | string) => void;
        calculateScanRegion?: (video: HTMLVideoElement) => {
            x: number;
            y: number;
            width: number;
            height: number;
            downScaledWidth?: number;
            downScaledHeight?: number;
        };
    }): QrScannerInstance;
    /**
     * Decode a QR code from any still-image source.
     * Uses BarcodeDetector when available, falls back to the nimiq worker.
     */
    scanImage(source: QrScannerSource, options: {
        returnDetailedScanResult: true;
        [key: string]: unknown;
    }): Promise<QrScannerResult>;
    listCameras(requestLabels?: boolean): Promise<Array<{
        id: string;
        label: string;
    }>>;
    hasCamera(): Promise<boolean>;
    readonly NO_QR_CODE_FOUND: string;
    _disableBarcodeDetector: boolean;
}
/**
 * Resolve `window.QrScanner` set by the UMD script tag.
 * Throws with a clear message if the script was not loaded.
 */
export declare function getQrScannerClass(): QrScannerStatic;
/**
 * Like getQrScannerClass but returns null instead of throwing.
 * Use when QrScanner is optional.
 */
export declare function tryGetQrScannerClass(): QrScannerStatic | null;
