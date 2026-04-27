using Microsoft.AspNetCore.Components;
using Microsoft.AspNetCore.Components.Routing;
using Microsoft.JSInterop;

namespace MidQr.Blazor;

/// <summary>
/// Blazor QR code scanner component backed by the mid-qr JS/WASM library
/// and the nimiq camera scanner.
///
/// Features
/// ────────
/// • Real-time camera decode via nimiq (hand-tuned binarizer for camera frames)
/// • Locked-mode decode — unwraps mid-qr-v1 payloads, redirects plain URLs
/// • Optional locked-only mode — non-mid-qr data triggers OnExternalScan instead
///   of OnQrCodeDetected, so the app can decide what to do
/// • Auto-stop on successful scan (configurable)
/// • Camera switching
/// • Status indicator for connectivity / sync feedback
///
/// Usage:
/// <code>
/// &lt;MidQrScanner OnQrCodeDetected="HandleScan"
///               LockedMode="true"
///               OnExternalScan="HandleExternal"
///               Width="100%" Height="400px" /&gt;
/// </code>
/// </summary>
public partial class MidQrScanner : IAsyncDisposable
{
    // ── DI ────────────────────────────────────────────────────────────────────

    [Inject] private IJSRuntime JS { get; set; } = default!;

    [Inject(Key = null)] private IMidQrIconProvider? IconProvider { get; set; }

    // ── Parameters ────────────────────────────────────────────────────────────

    /// <summary>
    /// Called with the decoded result on every successful scan.
    /// In locked mode the result contains the unwrapped payload.
    /// </summary>
    [Parameter] public EventCallback<MidQrScanResult> OnQrCodeDetected { get; set; }

    /// <summary>
    /// Called when a QR code is detected but it is NOT a mid-qr locked payload.
    /// Only fires when <see cref="LockedMode"/> is true.
    /// Return true to suppress the default redirect behaviour.
    /// </summary>
    [Parameter] public EventCallback<string> OnExternalScan { get; set; }

    /// <summary>
    /// When true, only locked mid-qr payloads are accepted.
    /// All other data triggers <see cref="OnExternalScan"/> instead of
    /// <see cref="OnQrCodeDetected"/>.
    /// Default: false
    /// </summary>
    [Parameter] public bool LockedMode { get; set; }

    /// <summary>CSS width of the scanner root.  Default: "100%"</summary>
    [Parameter] public string Width { get; set; } = "100%";

    /// <summary>CSS height of the scanner root.  Default: "400px"</summary>
    [Parameter] public string Height { get; set; } = "400px";

    /// <summary>Additional CSS class on the root element.</summary>
    [Parameter] public string CssClass { get; set; } = string.Empty;

    /// <summary>Inline style on the root element.</summary>
    [Parameter] public string Style { get; set; } = string.Empty;

    /// <summary>
    /// Preferred camera: "environment" (rear), "user" (front), or a device ID.
    /// Default: "environment"
    /// </summary>
    [Parameter] public string PreferredCamera { get; set; } = "environment";

    /// <summary>Maximum camera-frame decode attempts per second.  Default: 5</summary>
    [Parameter] public int MaxScansPerSecond { get; set; } = 5;

    /// <summary>Show the SVG corner-frame overlay.  Default: true</summary>
    [Parameter] public bool ShowOverlay { get; set; } = true;

    /// <summary>Show start/stop/camera-switch control buttons.  Default: true</summary>
    [Parameter] public bool ShowControls { get; set; } = true;

    /// <summary>Show the camera-switch button when multiple cameras are available.  Default: true</summary>
    [Parameter] public bool ShowCameraSwitch { get; set; } = true;

    /// <summary>Automatically stop the scanner after a successful decode.  Default: true</summary>
    [Parameter] public bool AutoStopOnSuccess { get; set; } = true;

    /// <summary>Delay in milliseconds before auto-stopping after a successful decode.  Default: 800</summary>
    [Parameter] public int AutoStopDelayMs { get; set; } = 800;

    [Parameter] public string StartLabel      { get; set; } = "Start Scanner";
    [Parameter] public string StopLabel       { get; set; } = "Stop Scanner";
    [Parameter] public string CameraSwitchLabel { get; set; } = "Switch Camera";
    [Parameter] public string ProcessingMessage { get; set; } = "Processing…";

    /// <summary>
    /// Optional render fragment shown below the controls after a successful scan.
    /// Receives the last <see cref="MidQrScanResult"/>.
    /// </summary>
    [Parameter] public RenderFragment<MidQrScanResult>? ResultContent { get; set; }

    /// <summary>Additional controls injected into the controls bar.</summary>
    [Parameter] public RenderFragment? ControlsContent { get; set; }

    // ── Public state ──────────────────────────────────────────────────────────

    public bool IsScanning   { get; private set; }
    public bool IsProcessing { get; private set; }

    // ── Internal state ────────────────────────────────────────────────────────

    private readonly string _instanceId = Guid.NewGuid().ToString("N")[..8];

    private IJSObjectReference? _jsModule;
    private DotNetObjectReference<MidQrScanner>? _dotNetRef;
    private bool _jsInitialised;

    private string _overlaySvg  = string.Empty;
    private string _spinnerSvg  = string.Empty;

    private string _statusMessage = string.Empty;
    private string _statusType    = string.Empty;   // "info" | "success" | "error"
    private CancellationTokenSource? _statusCts;

    private MidQrScanResult? _lastResult;
    private int _cameraCount = 1;

    private readonly SemaphoreSlim _scanLock = new(1, 1);

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    protected override async Task OnInitializedAsync()
    {
        await base.OnInitializedAsync();

        IconProvider ??= new DefaultMidQrIconProvider();

        var overlayTask  = IconProvider.GetScanOverlaySvgAsync();
        var spinnerTask  = IconProvider.GetLoadingSpinnerSvgAsync();
        await Task.WhenAll(overlayTask, spinnerTask);

        _overlaySvg = overlayTask.Result;
        _spinnerSvg = spinnerTask.Result;

        _dotNetRef  = DotNetObjectReference.Create(this);

        try
        {
            _jsModule      = await JS.InvokeAsync<IJSObjectReference>(
                                 "import", "./midQrModule.js");
            _jsInitialised = true;

            // Ask the JS side how many cameras the device has
            _cameraCount = await _jsModule.InvokeAsync<int>("getCameraCount");
        }
        catch (Exception ex)
        {
            await ShowStatusAsync($"Failed to load scanner: {ex.Message}", "error", 0);
        }
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        // Nothing auto-starts — the user or the parent component calls StartScanningAsync.
    }

    // ── JS-invokable methods (called from midQrModule.js) ─────────────────────

    /// <summary>
    /// Called by the JS scanner worker for every decoded frame.
    /// Handles locked-mode unwrapping and LockedMode filtering.
    /// </summary>
    [JSInvokable]
    public async Task OnFrameDecoded(string rawData)
    {
        if (IsProcessing || string.IsNullOrEmpty(rawData)) return;
        if (!await _scanLock.WaitAsync(0)) return; // drop concurrent calls

        try
        {
            IsProcessing = true;
            await InvokeAsync(StateHasChanged);

            // ── Locked-mode unwrap ────────────────────────────────────────────
            var (payload, wasLocked) = UnwrapLockedPayload(rawData);

            if (LockedMode && !wasLocked)
            {
                // External scan — fire OnExternalScan and do NOT call OnQrCodeDetected
                if (OnExternalScan.HasDelegate)
                    await OnExternalScan.InvokeAsync(rawData);
                return;
            }

            var result = new MidQrScanResult
            {
                Data      = payload,
                WasLocked = wasLocked,
                ScannedAt = DateTime.UtcNow,
            };

            _lastResult = result;

            if (OnQrCodeDetected.HasDelegate)
                await OnQrCodeDetected.InvokeAsync(result);

            await ShowStatusAsync("✅ Scan successful", "success", 2500);

            if (AutoStopOnSuccess)
            {
                await Task.Delay(AutoStopDelayMs);
                await StopScanningAsync();
            }
        }
        finally
        {
            IsProcessing = false;
            _scanLock.Release();
            await InvokeAsync(StateHasChanged);
        }
    }

    // ── Public scanner control API ────────────────────────────────────────────

    /// <summary>Request camera permission and start scanning.</summary>
    public async Task StartScanningAsync()
    {
        if (!_jsInitialised || _jsModule is null || IsScanning) return;

        try
        {
            await _jsModule.InvokeVoidAsync(
                "startScanner",
                $"mid-qr-video-{_instanceId}",
                _dotNetRef,
                PreferredCamera,
                MaxScansPerSecond);

            IsScanning = true;
            await InvokeAsync(StateHasChanged);
        }
        catch (Exception ex)
        {
            await ShowStatusAsync($"Camera error: {ex.Message}", "error", 4000);
        }
    }

    /// <summary>Stop the scanner.  The camera stream is released.</summary>
    public async Task StopScanningAsync()
    {
        if (!_jsInitialised || _jsModule is null || !IsScanning) return;

        try
        {
            await _jsModule.InvokeVoidAsync(
                "stopScanner",
                $"mid-qr-video-{_instanceId}");
        }
        catch { /* suppress — scanner may already be stopped */ }
        finally
        {
            IsScanning   = false;
            IsProcessing = false;
            await InvokeAsync(StateHasChanged);
        }
    }

    /// <summary>Cycle to the next available camera.</summary>
    public async Task SwitchCameraAsync()
    {
        if (!_jsInitialised || _jsModule is null || !IsScanning) return;

        try
        {
            await _jsModule.InvokeVoidAsync(
                "switchCamera",
                $"mid-qr-video-{_instanceId}");
        }
        catch (Exception ex)
        {
            await ShowStatusAsync($"Camera switch failed: {ex.Message}", "error", 3000);
        }
    }

    // ── Status indicator ──────────────────────────────────────────────────────

    /// <summary>
    /// Show a status message in the controls bar.
    /// Pass durationMs = 0 to show indefinitely.
    /// </summary>
    public async Task ShowStatusAsync(string message, string type = "info", int durationMs = 3000)
    {
        // Cancel any existing auto-dismiss
        _statusCts?.Cancel();
        _statusCts?.Dispose();
        _statusCts = null;

        _statusMessage = message;
        _statusType    = type;
        await InvokeAsync(StateHasChanged);

        if (durationMs <= 0) return;

        _statusCts = new CancellationTokenSource();
        var token  = _statusCts.Token;

        try
        {
            await Task.Delay(durationMs, token);
            if (!token.IsCancellationRequested)
            {
                _statusMessage = string.Empty;
                _statusType    = string.Empty;
                await InvokeAsync(StateHasChanged);
            }
        }
        catch (TaskCanceledException) { /* expected */ }
    }

    // ── Locked-mode helpers ───────────────────────────────────────────────────

    private const string LockedPrefix = "mid-qr-v1=";

    /// <summary>
    /// Attempt to unwrap a locked mid-qr payload from a scanned URL.
    ///
    /// Locked URLs look like:
    ///   https://redirect.example.com/scan?mid-qr-v1=eyJkYXRhIjoiLi4uIn0=
    ///
    /// The base64 value is a JSON object: { "data": "&lt;actual payload&gt;" }
    /// </summary>
    private static (string payload, bool wasLocked) UnwrapLockedPayload(string raw)
    {
        try
        {
            // Check for the locked marker in the query string
            int markerIdx = raw.IndexOf(LockedPrefix, StringComparison.Ordinal);
            if (markerIdx < 0) return (raw, false);

            var b64 = raw[(markerIdx + LockedPrefix.Length)..];

            // Strip any fragment or additional query params after the value
            var ampIdx = b64.IndexOf('&');
            if (ampIdx >= 0) b64 = b64[..ampIdx];
            var hashIdx = b64.IndexOf('#');
            if (hashIdx >= 0) b64 = b64[..hashIdx];

            var json    = System.Text.Encoding.UTF8.GetString(Convert.FromBase64String(b64));
            var doc     = System.Text.Json.JsonDocument.Parse(json);
            var payload = doc.RootElement.GetProperty("data").GetString() ?? raw;

            return (payload, true);
        }
        catch
        {
            // Malformed — treat as plain data
            return (raw, false);
        }
    }

    // ── Navigation guard (stop camera when leaving the page) ──────────────────

    public async Task OnBeforeInternalNavigation(LocationChangingContext context)
    {
        await StopScanningAsync();
        _statusCts?.Cancel();
    }

    // ── Disposal ──────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        await StopScanningAsync();
        _statusCts?.Cancel();
        _statusCts?.Dispose();
        _dotNetRef?.Dispose();
        _scanLock.Dispose();

        if (_jsModule is not null)
        {
            try   { await _jsModule.DisposeAsync(); }
            catch { /* suppress */ }
        }
    }
}
