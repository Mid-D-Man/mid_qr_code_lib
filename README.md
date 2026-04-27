# mid-qr

Unified QR code generation and scanning — Rust/WASM core, JS npm package, Blazor wrapper.

## Packages

| Layer | Path | Description |
|---|---|---|
| Core (Rust) | `crates/mid-qr-core` | Pure Rust — generate + static decode |
| WASM bindings | `crates/mid-qr-wasm` | wasm-bindgen surface |
| npm package | `npm/` | TS wrapper + nimiq camera scanner |
| Blazor wrapper | `wrappers/blazor/` | Razor components + JS interop |

## Quick start

```bash
npm install mid-qr
```

See `docs/getting-started.md`.

## License

MIT
