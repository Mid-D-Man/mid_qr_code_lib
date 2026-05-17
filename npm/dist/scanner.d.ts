import type { ScannerOptions, OnDecodeCallback, OnDecodeErrorCallback, CameraInfo } from './types.js';
export declare class MidQrScanner {
    private readonly _inner;
    private readonly _video;
    private readonly _cameras;
    private readonly _onDecode;
    private readonly _onError;
    private _scanning;
    private _cameraIdx;
    private constructor();
    static create(video: HTMLVideoElement, onDecode: OnDecodeCallback, options?: ScannerOptions, onError?: OnDecodeErrorCallback): Promise<MidQrScanner>;
    start(): Promise<void>;
    stop(): void;
    destroy(): void;
    switchCamera(): Promise<void>;
    setCameraById(deviceId: string): Promise<void>;
    get flashOn(): boolean;
    hasFlash(): Promise<boolean>;
    toggleFlash(): Promise<void>;
    get isScanning(): boolean;
    get cameras(): CameraInfo[];
    get currentCamera(): CameraInfo | undefined;
    static hasCamera(): Promise<boolean>;
    static listCameras(): Promise<CameraInfo[]>;
}
