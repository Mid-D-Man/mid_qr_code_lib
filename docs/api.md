# API Reference

## MidQr (combined facade — recommended)

### `MidQr.create(wasmUrl?): Promise<MidQr>`

Initialise the WASM module. Call once on app startup.

```ts
// GitHub Pages / CDN — explicit path required
const qr = await MidQr.create(new URL('/wasm/mid_qr_wasm_bg.wasm', location.origin));

// Local dev — path inferred from import.meta.url
const qr = await MidQr.create();
```

---

### `generate(options): string`

Returns an SVG string. All style fields are optional and default to a standard black-on-white square QR code.

#### Core options

| Option       | Type      | Default     | Notes |
|--------------|-----------|-------------|-------|
| `data`       | string    | **required**| Content to encode |
| `size`       | number    | `300`       | Target size in px; renderer rounds up to fit whole modules |
| `darkColor`  | string    | `"#000000"` | CSS color for dark modules |
| `lightColor` | string    | `"#FFFFFF"` | CSS color for background |
| `errorLevel` | ErrorLevel| `"M"`       | `"L"` `"M"` `"Q"` `"H"` — use `"H"` with logos |
| `margin`     | boolean   | `true`      | Include the quiet zone |

#### Module style options

| Option              | Type              | Default    | Notes |
|---------------------|-------------------|------------|-------|
| `moduleStyle`       | ModuleStyle       | `"square"` | Shape of every data module |
| `cornerSquareStyle` | CornerSquareStyle | `"square"` | Outer ring of each finder-pattern eye |
| `cornerDotStyle`    | CornerDotStyle    | `"square"` | Inner dot of each finder-pattern eye |
| `eyeColor`          | EyeColorOptions   | —          | Independent colors for eye rings and dots |

**ModuleStyle values**

| Value            | Description |
|------------------|-------------|
| `"square"`       | Sharp-corner rectangles (default) |
| `"dot"`          | Filled circles (~90% of module size) |
| `"rounded"`      | Rectangles with 25% corner radius |
| `"extra-rounded"`| Rectangles with 45% corner radius |
| `"classy"`       | Square but top-right + bottom-left corners rounded |
| `"classy-rounded"`| Uniform 32% corner rounding |

**CornerSquareStyle values**

| Value            | Description |
|------------------|-------------|
| `"square"`       | Sharp rectangle (default) |
| `"extra-rounded"`| Heavily rounded rectangle |
| `"dot"`          | Concentric circles |

**CornerDotStyle values**

| Value    | Description |
|----------|-------------|
| `"square"` | Filled square (default) |
| `"dot"`    | Filled circle |

**EyeColorOptions**

```ts
interface EyeColorOptions {
  outer: string;  // outer 7×7 ring color
  inner: string;  // inner 3×3 dot color
}
```

When `eyeColor` is omitted, eyes inherit `darkColor` (or the gradient, if one is set).

#### Gradient options

```ts
interface GradientOptions {
  direction?: 'linear-x' | 'linear-y' | 'diagonal' | 'radial';
  color1: string;   // gradient start (CSS color)
  color2: string;   // gradient end   (CSS color)
}
```

Gradient applies to data modules. Eyes also use the gradient unless `eyeColor` is set.

#### Logo options

```ts
interface LogoOptions {
  url:        string;             // URL or data-URI
  sizeRatio?: number;             // 0.10–0.35, default 0.25
  border?: {
    color:   string;
    width?:  number;              // default 2
    radius?: number;              // corner radius
  };
}
```

Always use `errorLevel: "H"` when embedding a logo.

#### Frame options

Adds a decorative border around the QR code with an optional text label.

```ts
interface FrameOptions {
  style:      0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  color:      string;    // frame background / border CSS color
  text?:      string;    // label text — default "Scan Me!"
  textColor?: string;    // label text CSS color — default "#ffffff"
}
```

| style | Description |
|-------|-------------|
| `0`   | No frame (default) |
| `1`   | Solid square background — label **below** QR |
| `2`   | Rounded background — label **below** QR |
| `3`   | Solid square background — label **above** QR |
| `4`   | Rounded background — label **above** QR |
| `5`   | Square border + rounded badge tab **below** |
| `6`   | Rounded border + rounded badge tab **below** |
| `7`   | Thick square border only (no label area) |
| `8`   | Double square border (no label area) |

#### Full example

```ts
const svg = qr.generate({
  data:              'https://example.com',
  size:              320,
  errorLevel:        'H',
  moduleStyle:       'dot',
  cornerSquareStyle: 'extra-rounded',
  cornerDotStyle:    'dot',
  eyeColor:          { outer: '#e63946', inner: '#2563eb' },
  gradient:          { direction: 'diagonal', color1: '#e63946', color2: '#2563eb' },
  logo:              { url: '/logo.svg', sizeRatio: 0.25, border: { color: 'white', radius: 4 } },
  frame:             { style: 2, color: '#1a1a2e', text: 'Scan Me!', textColor: '#ffffff' },
});
document.getElementById('qr').innerHTML = svg;
```

---

### `generateSimple(data, size?, darkColor?, lightColor?): string`

Convenience wrapper — no options object, no style customisation.

```ts
const svg = qr.generateSimple('https://example.com', 300, '#000000', '#FFFFFF');
```

---

### `decode(source): Promise<string>`

Decode a QR code from a still image via nimiq `QrScanner.scanImage()`.

Accepted source types: `File` | `Blob` | `URL` | `string` (URL) | `HTMLImageElement` | `HTMLCanvasElement` | `OffscreenCanvas` | `ImageBitmap`

Requires `qr-scanner.umd.min.js` loaded via `<script>` tag before any `<script type="module">`.

```ts
const text = await qr.decode(fileInput.files[0]);
```

---

### `createScanner(video, onDecode, options?, onError?): Promise<MidQrScanner>`

Create a real-time camera scanner. See **MidQrScanner** section below.

---

### `getCapabilities(): MidQrCapabilities`

Returns all supported option values as typed arrays. Use to drive UI pickers without hard-coding the lists.

```ts
const caps = qr.getCapabilities();
// caps.moduleStyles        → ['square','dot','rounded','extra-rounded','classy','classy-rounded']
// caps.cornerSquareStyles  → ['square','extra-rounded','dot']
// caps.cornerDotStyles     → ['square','dot']
// caps.gradientDirections  → ['linear-x','linear-y','diagonal','radial']
// caps.frameStyles         → [0,1,2,3,4,5,6,7,8]
// caps.errorLevels         → ['L','M','Q','H']
```

---

### Static helpers

```ts
MidQr.hasCamera(): Promise<boolean>
MidQr.listCameras(): Promise<CameraInfo[]>
```

---

### `qr.version: string`

Version string from the WASM build (`"0.1.0"` etc.).

---

### `qr.status: MidQrStatus`

```ts
{
  wasmLoaded:            true,
  version:               "0.1.0",
  nativeBarcodeDetector: true   // false on non-Chromium browsers
}
```

---

## MidQrScanner (real-time camera)

### `MidQrScanner.create(video, onDecode, options?, onError?): Promise<MidQrScanner>`

| Option              | Default         | Notes |
|---------------------|-----------------|-------|
| `preferredCamera`   | `"environment"` | `"user"` for front camera, or a deviceId string |
| `maxScansPerSecond` | `5`             | Reduce for battery life |
| `highlightScanRegion` | `false`       | SVG corner overlay |
| `highlightCodeOutline` | `false`      | Detected code outline |

### Instance methods

```ts
scanner.start(): Promise<void>
scanner.stop(): void
scanner.destroy(): void
scanner.switchCamera(): Promise<void>
scanner.setCameraById(deviceId: string): Promise<void>
```

### Flash control

```ts
scanner.hasFlash(): Promise<boolean>
scanner.flashOn: boolean          // read-only
scanner.toggleFlash(): Promise<void>
```

### State

```ts
scanner.isScanning: boolean
scanner.cameras: CameraInfo[]
scanner.currentCamera: CameraInfo | undefined
```

### Static helpers

```ts
MidQrScanner.hasCamera(): Promise<boolean>
MidQrScanner.listCameras(): Promise<CameraInfo[]>
```

---

## MidQrGenerator (generation + static decode only)

Same API surface as the generation and decode sections of `MidQr` above.  
Import directly when you don't need the camera scanner to keep bundle size minimal.

```ts
import { MidQrGenerator } from 'mid-qr';
const gen = await MidQrGenerator.create(wasmUrl);
gen.generate({ data: '...', moduleStyle: 'dot' });
gen.getCapabilities();
```

---

## TypeScript types

```ts
import type {
  GenerateOptions,
  ModuleStyle,          // 'square' | 'dot' | 'rounded' | 'extra-rounded' | 'classy' | 'classy-rounded'
  CornerSquareStyle,    // 'square' | 'extra-rounded' | 'dot'
  CornerDotStyle,       // 'square' | 'dot'
  EyeColorOptions,
  FrameOptions,
  GradientOptions,
  GradientDirection,
  LogoOptions,
  LogoBorderOptions,
  ErrorLevel,           // 'L' | 'M' | 'Q' | 'H'
  ScannerOptions,
  ScanResult,
  OnDecodeCallback,
  OnDecodeErrorCallback,
  CameraInfo,
  MidQrStatus,
  MidQrCapabilities,
} from 'mid-qr';
```
