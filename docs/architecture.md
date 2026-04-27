# Architecture

```
┌─────────────────────────────────────────────────────┐
│  Consumer (Blazor WASM / plain browser JS / Node)   │
├───────────────────────┬─────────────────────────────┤
│  npm/src/generator.ts │  npm/src/scanner.ts          │
│  (WASM generate calls)│  (camera orchestration)      │
├───────────────────────┤                              │
│  crates/mid-qr-wasm   │  nimiq qr-scanner-worker     │
│  (wasm-bindgen)       │  (real-time frame decode)    │
├───────────────────────┤  BarcodeDetector API         │
│  crates/mid-qr-core   │  (native OS fallback)        │
│  generate.rs (qrcode) │                              │
│  decode.rs   (rxing)  │  (still-image decode only)   │
└───────────────────────┴─────────────────────────────┘
```

## Why three decode paths?

| Path | Used for | Why |
|---|---|---|
| BarcodeDetector API | Camera frames, modern Chromium | Native, fastest of all — zero JS overhead |
| nimiq worker | Camera frames, non-Chromium | Hand-tuned binarizer for motion blur / uneven light |
| rxing WASM | Still images (file uploads) | Best quality on high-res clean images — no camera needed |

## Build outputs

| Artifact | Source | Destination |
|---|---|---|
| `mid-qr-wasm_bg.wasm` | `cargo build --target wasm32` | `npm/wasm/` and `wrappers/blazor/wwwroot/wasm/` |
| `dist/index.js` | `npm/src/` TypeScript | `npm/dist/` |
| npm package | `npm/dist/` + `npm/wasm/` | npmjs.com or GitHub dist branch |
