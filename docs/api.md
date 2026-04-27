# API Reference

## MidQr (generator + static decode)

### `MidQr.create(): Promise<MidQr>`
Initialise the WASM module.  Call once on app startup.

### `generate(options): string`
Returns an SVG string.

| Option | Type | Default | Notes |
|---|---|---|---|
| `data` | string | required | Content to encode |
| `size` | number | 300 | Hint — renderer rounds up to fit whole modules |
| `darkColor` | string | "#000000" | CSS color |
| `lightColor` | string | "#FFFFFF" | CSS color |
| `errorLevel` | "L"\|"M"\|"Q"\|"H" | "M" | Use "H" with logo |
| `margin` | boolean | true | Quiet zone |
| `gradient` | GradientOptions | — | See below |
| `logo` | LogoOptions | — | See below |

**GradientOptions**
```ts
{ direction: 'linear-x'|'linear-y'|'diagonal'|'radial', color1: string, color2: string }
```

**LogoOptions**
```ts
{ url: string, sizeRatio?: number, border?: { color: string, width?: number, radius?: number } }
```

### `generateSimple(data, size, darkColor, lightColor): string`
Convenience wrapper with no options object.

### `decode(source: File | Blob | HTMLImageElement | HTMLCanvasElement): Promise<string>`
Decode a QR code from a still image.

---

## MidQrScanner (real-time camera)

### `MidQrScanner.create(video, onDecode, options?): Promise<MidQrScanner>`

| Option | Default | Notes |
|---|---|---|
| `preferredCamera` | "environment" | "user" for front camera |
| `maxScansPerSecond` | 5 | Reduce for battery life |

### `start(): Promise<void>`
### `stop(): void`
### `switchCamera(): Promise<void>`
### `destroy(): void`
### `isScanning: boolean`
