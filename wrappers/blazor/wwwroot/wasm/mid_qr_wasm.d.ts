/* tslint:disable */
/* eslint-disable */
export function decodeRgba(rgba: Uint8Array, width: number, height: number): string;
export function getVersion(): string;
export function getSupportedCornerDotStyles(): string;
export function decodeLuma(luma: Uint8Array, width: number, height: number): string;
export function getSupportedModuleStyles(): string;
export function init(): void;
export function getSupportedCornerSquareStyles(): string;
export function getSupportedGradientDirections(): string;
export function getSupportedFrameStyles(): string;
export function getSupportedErrorLevels(): string;
export function generateSimple(data: string, size: number, dark_color: string, light_color: string): string;
export function generate(options: any): string;
export function rgbaToLuma(rgba: Uint8Array): Uint8Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly decodeLuma: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly decodeRgba: (a: number, b: number, c: number, d: number, e: number) => void;
  readonly generate: (a: number, b: number) => void;
  readonly generateSimple: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => void;
  readonly getSupportedCornerDotStyles: (a: number) => void;
  readonly getSupportedCornerSquareStyles: (a: number) => void;
  readonly getSupportedErrorLevels: (a: number) => void;
  readonly getSupportedFrameStyles: (a: number) => void;
  readonly getSupportedGradientDirections: (a: number) => void;
  readonly getSupportedModuleStyles: (a: number) => void;
  readonly getVersion: (a: number) => void;
  readonly init: () => void;
  readonly rgbaToLuma: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_0: (a: number, b: number) => number;
  readonly __wbindgen_export_1: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
  readonly __wbindgen_export_2: (a: number, b: number, c: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
