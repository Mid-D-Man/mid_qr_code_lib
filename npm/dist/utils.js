// =============================================================================
// mid-qr — shared nimiq QrScanner resolution
// Both generator.ts (static decode) and scanner.ts (camera scan) use this.
// QrScanner must be loaded via <script src="qr-scanner.umd.min.js"> BEFORE
// any module script.  The UMD build sets window.QrScanner and correctly
// resolves qr-scanner-worker.min.js relative to its own URL.
// =============================================================================
// ── Cache ─────────────────────────────────────────────────────────────────────
let _qrScannerClass = null;
// ── Resolvers ─────────────────────────────────────────────────────────────────
/**
 * Resolve `window.QrScanner` set by the UMD script tag.
 * Throws with a clear message if the script was not loaded.
 */
export function getQrScannerClass() {
    if (_qrScannerClass)
        return _qrScannerClass;
    const win = typeof window !== 'undefined'
        ? window
        : null;
    if (win?.['QrScanner']) {
        _qrScannerClass = win['QrScanner'];
        return _qrScannerClass;
    }
    throw new Error('mid-qr: QrScanner not found on window.\n' +
        'Add the following tag BEFORE your <script type="module"> in your HTML:\n' +
        '  <script src="path/to/qr-scanner.umd.min.js"></script>\n' +
        'The UMD build sets window.QrScanner and resolves the worker correctly.');
}
/**
 * Like getQrScannerClass but returns null instead of throwing.
 * Use when QrScanner is optional.
 */
export function tryGetQrScannerClass() {
    try {
        return getQrScannerClass();
    }
    catch {
        return null;
    }
}
