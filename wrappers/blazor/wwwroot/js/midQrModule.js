// =============================================================================
// midQrModule.js — Blazor JS interop for mid-qr
//
// Responsibilities
// ────────────────
// 1. WASM lifecycle  — lazy init, one-time, safe for concurrent callers
// 2. QR generation   — delegates to WASM, handles locked-mode URL encoding
// 3. Scanner bridge  — wraps nimiq QrScanner per video element (multi-instance)
// 4. Locked-mode     — encodes payload into redirect URL; decode is done in C#
// 5. setSvgContent   — injects generated SVG into the Blazor container div
// 6. getCameraCount  — returns camera count for the camera-switch button guard
//
// Locked-mode protocol
// ────────────────────
// Encoded QR data = "<redirectUrl>?mid-qr-v1=<base64(json)>"
// JSON = { "data": "<actual payload>" }
// External scanner → opens redirectUrl in browser (sees the redirect page)
// MidQrScanner     → unwraps in C# UnwrapLockedPayload()
// =============================================================================

// ── WASM state ────────────────────────────────────────────────────────────────

/** @type {import('../wasm/mid_qr_wasm.js') | null} */
let _wasmModule = null;
let _wasmReady  = false;
let _wasmPromise = null;

/**
 * Lazily initialise the Rust WASM module.
 * Safe to call concurrently — all callers await the same Promise.
 *
 * @param {string | URL | null} wasmUrl
 *   Explicit path to mid_qr_wasm_bg.wasm.
 *   When null, the JS glue resolves it relative to import.meta.url.
 * @returns {Promise<void>}
 */
export async function initWasm(wasmUrl = null) {
  if (_wasmReady) return;
  if (_wasmPromise) { await _wasmPromise; return; }

  _wasmPromise = (async () => {
    try {
      // Dynamic import keeps WASM out of the initial JS parse budget
      const mod = await import('../wasm/mid_qr_wasm.js');

      if (wasmUrl !== null) {
        await mod.default(wasmUrl);
      } else {
        // Resolve .wasm sibling relative to this module's URL
        const autoUrl = new URL('../wasm/mid_qr_wasm_bg.wasm', import.meta.url);
        await mod.default(autoUrl);
      }

      _wasmModule = mod;
      _wasmReady  = true;
      console.log('[mid-qr] WASM initialised — version', mod.getVersion?.() ?? '?');
    } catch (err) {
      console.error('[mid-qr] WASM init failed:', err);
      // Allow retrying by clearing the promise
      _wasmPromise = null;
      throw err;
    }
  })();

  await _wasmPromise;
}

// ── Generation ────────────────────────────────────────────────────────────────

/**
 * Generate a QR code SVG.
 *
 * Called from MidQrCode.razor.cs via IJSObjectReference.
 *
 * @param {string}      data        Content to encode (the real payload)
 * @param {object}      options     Generation options (mirrors MidQrGenerateOptions)
 * @param {string|null} redirectUrl When non-null, wrap data in locked-mode URL
 * @returns {Promise<string>}       SVG markup string
 */
export async function generateQrCode(data, options, redirectUrl = null) {
  await initWasm();

  if (!_wasmModule) throw new Error('[mid-qr] WASM module is not available');
  if (!data || data.trim().length === 0) throw new Error('[mid-qr] data cannot be empty');

  // ── Locked-mode encoding ────────────────────────────────────────────────
  let encodedData = data;
  if (redirectUrl && redirectUrl.trim().length > 0) {
    encodedData = buildLockedUrl(data, redirectUrl);
  }

  // ── Delegate to WASM ────────────────────────────────────────────────────
  // serde-wasm-bindgen on the Rust side accepts this plain JS object.
  const wasmOpts = {
    data:       encodedData,
    size:       options.size       ?? 300,
    darkColor:  options.darkColor  ?? '#000000',
    lightColor: options.lightColor ?? '#FFFFFF',
    errorLevel: options.errorLevel ?? 'M',
    margin:     options.margin     ?? true,
    gradient:   options.gradient   ?? undefined,
    logo:       options.logo       ?? undefined,
  };

  try {
    return _wasmModule.generate(wasmOpts);
  } catch (err) {
    throw new Error(`[mid-qr] generation failed: ${err}`);
  }
}

// ── Locked-mode helpers ───────────────────────────────────────────────────────

/**
 * Encode the real payload into a locked-mode redirect URL.
 *
 * URL format:  <redirectUrl>?mid-qr-v1=<base64(json)>
 * JSON format: { "data": "<payload>" }
 *
 * @param {string} payload
 * @param {string} redirectUrl
 * @returns {string}
 */
function buildLockedUrl(payload, redirectUrl) {
  const json   = JSON.stringify({ data: payload });
  const b64    = btoa(unescape(encodeURIComponent(json))); // UTF-8 → base64

  // Append as a query parameter — works with or without existing params
  const sep = redirectUrl.includes('?') ? '&' : '?';
  return `${redirectUrl}${sep}mid-qr-v1=${b64}`;
}

// ── SVG injection ─────────────────────────────────────────────────────────────

/**
 * Inject SVG markup into a DOM element by ID.
 * Called from MidQrCode.razor.cs after generation.
 *
 * @param {string} elementId  The container div ID
 * @param {string} svgContent SVG markup string
 */
export function setSvgContent(elementId, svgContent) {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn(`[mid-qr] setSvgContent: element '${elementId}' not found`);
    return;
  }
  el.innerHTML = svgContent;
}

// ── Camera count ──────────────────────────────────────────────────────────────

/**
 * Return the number of video-input devices available.
 * Used by MidQrScanner to decide whether to show the camera-switch button.
 *
 * @returns {Promise<number>}
 */
export async function getCameraCount() {
  try {
    if (!navigator.mediaDevices?.enumerateDevices) return 1;
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput').length;
  } catch {
    return 1;
  }
}

// ── Scanner management ────────────────────────────────────────────────────────

/**
 * Map of videoElementId → QRScannerInstance.
 * Supports multiple independent scanner components on the same page.
 * @type {Map<string, QRScannerInstance>}
 */
const _scanners = new Map();

/**
 * Create and start a scanner attached to the given video element.
 *
 * @param {string}      videoId        ID of the <video> element
 * @param {object}      dotNetRef      DotNetObjectReference to MidQrScanner
 * @param {string}      preferredCamera "environment" | "user" | deviceId
 * @param {number}      maxScansPerSecond
 */
export async function startScanner(videoId, dotNetRef, preferredCamera, maxScansPerSecond) {
  // Stop any existing instance for this video element
  await stopScanner(videoId);

  const video = document.getElementById(videoId);
  if (!video) throw new Error(`[mid-qr] video element '${videoId}' not found`);

  const instance = new QRScannerInstance(
    video,
    dotNetRef,
    preferredCamera,
    maxScansPerSecond,
  );

  await instance.start();
  _scanners.set(videoId, instance);
}

/**
 * Stop the scanner attached to the given video element.
 * No-op if no scanner exists for that ID.
 *
 * @param {string} videoId
 */
export async function stopScanner(videoId) {
  const instance = _scanners.get(videoId);
  if (!instance) return;

  instance.destroy();
  _scanners.delete(videoId);
}

/**
 * Cycle to the next available camera for the given scanner instance.
 *
 * @param {string} videoId
 */
export async function switchCamera(videoId) {
  const instance = _scanners.get(videoId);
  if (!instance) return;
  await instance.switchCamera();
}

// ── QRScannerInstance ─────────────────────────────────────────────────────────

/**
 * Wraps one nimiq QrScanner instance.
 * Handles camera enumeration, stream quality constraints, and DotNet callbacks.
 */
class QRScannerInstance {
  /**
   * @param {HTMLVideoElement} video
   * @param {object}           dotNetRef
   * @param {string}           preferredCamera
   * @param {number}           maxScansPerSecond
   */
  constructor(video, dotNetRef, preferredCamera, maxScansPerSecond) {
    this._video             = video;
    this._dotNetRef         = dotNetRef;
    this._preferredCamera   = preferredCamera;
    this._maxScansPerSecond = maxScansPerSecond;
    this._scanner           = null;
    this._cameras           = [];
    this._cameraIndex       = 0;
    this._decoding          = false;
  }

  async start() {
    const QrScanner = await resolveQrScanner();

    // Enumerate cameras before creating the scanner so we can choose the
    // environment-facing one by label when preferredCamera = "environment".
    this._cameras = await QrScanner.listCameras(true).catch(() => []);

    // Determine the actual camera to start with
    let startCamera = this._preferredCamera;
    if (this._cameras.length > 0 &&
        (startCamera === 'environment' || startCamera === 'user')) {
      const envIdx = this._cameras.findIndex(
        c => /back|rear|environment/i.test(c.label),
      );
      this._cameraIndex = this._preferredCamera === 'environment'
        ? (envIdx >= 0 ? envIdx : 0)
        : (this._cameras.length - 1 - (envIdx >= 0 ? envIdx : 0));
      startCamera = this._cameras[this._cameraIndex]?.id ?? startCamera;
    }

    this._scanner = new QrScanner(
      this._video,
      result => this._onDecode(result),
      {
        preferredCamera:       startCamera,
        maxScansPerSecond:     this._maxScansPerSecond,
        highlightScanRegion:   false,
        highlightCodeOutline:  false,
        returnDetailedScanResult: true,
        onDecodeError:         () => { /* silent — expected on most frames */ },
        calculateScanRegion:   (v) => {
          // 80 % of the shorter dimension — same as the TS scanner wrapper
          const size = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.80);
          return {
            x:      Math.round((v.videoWidth  - size) / 2),
            y:      Math.round((v.videoHeight - size) / 2),
            width:  size,
            height: size,
          };
        },
      },
    );

    await this._scanner.start();
    await this._applyQualityConstraints();
  }

  destroy() {
    try { this._scanner?.destroy(); } catch { /* ignore */ }
    this._scanner = null;
  }

  async switchCamera() {
    if (!this._scanner || this._cameras.length <= 1) return;

    this._scanner.stop();

    this._cameraIndex = (this._cameraIndex + 1) % this._cameras.length;
    const next = this._cameras[this._cameraIndex];

    await this._scanner.setCamera(next.id);
    await this._scanner.start();
    await this._applyQualityConstraints();
  }

  /**
   * Attempt to apply higher-resolution constraints on the active track.
   * Non-fatal on rejection — lower resolution still works.
   */
  async _applyQualityConstraints() {
    const stream = this._video.srcObject;
    if (!(stream instanceof MediaStream)) return;

    const track = stream.getVideoTracks()[0];
    if (!track?.applyConstraints) return;

    try {
      await track.applyConstraints({
        width:  { ideal: 1920, min: 1280 },
        height: { ideal: 1080, min: 720  },
      });
    } catch {
      // Browser may reject — non-fatal
    }
  }

  /**
   * Handle a decoded frame result from the nimiq scanner.
   * Calls the C# DotNetObjectReference.OnFrameDecoded(string).
   *
   * @param {{ data: string }} result
   */
  async _onDecode(result) {
    if (this._decoding || !result?.data) return;
    this._decoding = true;

    try {
      await this._dotNetRef.invokeMethodAsync('OnFrameDecoded', result.data);
    } catch (err) {
      console.error('[mid-qr] OnFrameDecoded invoke failed:', err);
    } finally {
      this._decoding = false;
    }
  }
}

// ── nimiq QrScanner resolution ────────────────────────────────────────────────

/** @type {typeof import('./worker/qr-scanner.min.js').default | null} */
let _QrScannerClass = null;

/**
 * Resolve the nimiq QrScanner class from window (UMD) or ES module import.
 * Cached after first resolution.
 *
 * @returns {Promise<typeof QrScanner>}
 */
async function resolveQrScanner() {
  if (_QrScannerClass) return _QrScannerClass;

  // UMD bundle loaded via Blazor's script injection
  if (typeof window !== 'undefined' && window['QrScanner']) {
    _QrScannerClass = window['QrScanner'];
    return _QrScannerClass;
  }

  // ES module — path relative to this file inside wwwroot/js/
  try {
    const mod = await import('./worker/qr-scanner.min.js');
    _QrScannerClass = mod.default;
    return _QrScannerClass;
  } catch (err) {
    throw new Error(
      '[mid-qr] QrScanner not found. ' +
      'Add a <script> tag for qr-scanner.umd.min.js in your index.html, ' +
      'or ensure the worker/ directory is present in wwwroot/js/.',
    );
  }
                  }
