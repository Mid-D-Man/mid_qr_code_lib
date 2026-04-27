# Getting Started

## Installation

```bash
npm install mid-qr
```

## Basic usage

```js
import { MidQr } from 'mid-qr';

const qr  = await MidQr.create();
const svg = qr.generate({ data: 'https://example.com', size: 300 });
document.getElementById('qr').innerHTML = svg;
```

## With gradient and logo

```js
const svg = qr.generate({
  data:       'https://example.com',
  size:       400,
  errorLevel: 'H',
  gradient:   { direction: 'diagonal', color1: '#8B5CF6', color2: '#06B6D4' },
  logo:       { url: '/logo.png', sizeRatio: 0.25,
                border: { color: 'white', width: 3, radius: 4 } }
});
```

## Scanning a still image

```js
const text = await qr.decode(imageFile);
```

## Real-time camera scanning

```js
import { MidQrScanner } from 'mid-qr';

const scanner = await MidQrScanner.create(
  videoElement,
  text => console.log('Scanned:', text)
);
await scanner.start();
```

See `api.md` for full reference.
