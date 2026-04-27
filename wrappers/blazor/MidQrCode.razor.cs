using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace MidQr.Blazor;

/// <summary>
/// Blazor component that renders a QR code SVG via the mid-qr WASM library.
///
/// Usage:
/// <code>
/// &lt;MidQrCode Data="https://example.com"
///            Options="@(new MidQrGenerateOptions { Size = 400, ErrorLevel = MidQrErrorLevel.H,
///                         Gradient = new() { Direction = MidQrGradientDirection.Diagonal,
///                                            Color1 = "#8B5CF6", Color2 = "#06B6D4" } })"
///            OnGenerated="OnQrGenerated" /&gt;
/// </code>
///
/// Locked mode:
/// <code>
/// &lt;MidQrCode Data="@_sessionPayload"
///            Options="@(new MidQrGenerateOptions {
///                         ErrorLevel = MidQrErrorLevel.H,
///                         Locked = new() { RedirectUrl = "https://your-app.com/scan-redirect" } })"
///            OnGenerated="OnQrGenerated" /&gt;
/// </code>
/// </summary>
public partial class MidQrCode : IAsyncDisposable
{
    // ── DI ────────────────────────────────────────────────────────────────────

    [Inject] private IJSRuntime JS { get; set; } = default!;

    /// <summary>
    /// Optional — inject your VisualElementsService adapter here.
    /// Falls back to DefaultMidQrIconProvider when not registered.
    /// </summary>
    [Inject(Key = null)] private IMidQrIconProvider? IconProvider { get; set; }

    // ── Parameters ────────────────────────────────────────────────────────────

    /// <summary>Content to encode into the QR code. Required.</summary>
    [Parameter, EditorRequired] public string Data { get; set; } = string.Empty;

    /// <summary>
    /// Full generation options.
    /// When null, sensible defaults are used.
    /// Locked mode is configured here via Options.Locked.
    /// </summary>
    [Parameter] public MidQrGenerateOptions? Options { get; set; }

    /// <summary>
    /// Convenience theme selector.
    /// Ignored when Options includes explicit Gradient/Logo settings.
    /// Default: Standard.
    /// </summary>
    [Parameter] public MidQrTheme Theme { get; set; } = MidQrTheme.Standard;

    /// <summary>Called after every successful QR code generation.</summary>
    [Parameter] public EventCallback<MidQrResult> OnGenerated { get; set; }

    /// <summary>Called when generation fails.</summary>
    [Parameter] public EventCallback<string> OnError { get; set; }

    /// <summary>Additional CSS class on the root element.</summary>
    [Parameter] public string CssClass { get; set; } = string.Empty;

    /// <summary>Inline style on the root element.</summary>
    [Parameter] public string Style { get; set; } = string.Empty;

    /// <summary>Text shown in the loading overlay.  Default: "Generating QR code…"</summary>
    [Parameter] public string LoadingMessage { get; set; } = "Generating QR code…";

    /// <summary>Show a Retry button when generation fails.  Default: true</summary>
    [Parameter] public bool ShowRetryOnError { get; set; } = true;

    /// <summary>Optional content rendered below the QR code (validity timer, instructions, etc.).</summary>
    [Parameter] public RenderFragment? InfoContent { get; set; }

    // ── Convenience read-only properties ──────────────────────────────────────

    /// <summary>Whether the QR code is in locked mode.</summary>
    public bool IsLocked => Options?.Locked is not null &&
                            !string.IsNullOrEmpty(Options.Locked.RedirectUrl);

    // ── Internal state ────────────────────────────────────────────────────────

    private readonly string _instanceId = Guid.NewGuid().ToString("N")[..8];

    private IJSObjectReference? _jsModule;
    private bool _jsInitialised;

    private bool   _isLoading    = false;
    private bool   _hasError     = false;
    private string _errorMessage = string.Empty;
    private bool   _isGenerating = false;

    // Cached icon SVGs — loaded once, reused on every render
    private string _spinnerSvg = string.Empty;
    private string _errorSvg   = string.Empty;
    private string _lockedSvg  = string.Empty;

    // Change-detection — compare against previous values to avoid redundant re-generation
    private string              _lastData    = string.Empty;
    private MidQrGenerateOptions? _lastOptions;
    private MidQrTheme          _lastTheme   = MidQrTheme.Standard;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    protected override async Task OnInitializedAsync()
    {
        await base.OnInitializedAsync();

        // Resolve icon provider — prefer DI registration, fall back to default
        IconProvider ??= new DefaultMidQrIconProvider();

        // Load icon SVGs in parallel
        var spinnerTask = IconProvider.GetLoadingSpinnerSvgAsync();
        var errorTask   = IconProvider.GetErrorIconSvgAsync();
        var lockedTask  = IconProvider.GetLockedIconSvgAsync();

        await Task.WhenAll(spinnerTask, errorTask, lockedTask);

        _spinnerSvg = spinnerTask.Result;
        _errorSvg   = errorTask.Result;
        _lockedSvg  = lockedTask.Result;

        // Initialise the JS/WASM module
        try
        {
            _jsModule       = await JS.InvokeAsync<IJSObjectReference>(
                                  "import", "./midQrModule.js");
            _jsInitialised  = true;
        }
        catch (Exception ex)
        {
            await SetError($"Failed to load QR module: {ex.Message}");
        }
    }

    protected override async Task OnParametersSetAsync()
    {
        await base.OnParametersSetAsync();

        if (!_jsInitialised) return;
        if (_isGenerating)   return;

        // Only regenerate when something meaningful changed
        if (Data == _lastData && Options == _lastOptions && Theme == _lastTheme)
            return;

        await GenerateQrCode();
    }

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender && _jsInitialised && string.IsNullOrEmpty(_lastData))
        {
            await GenerateQrCode();
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /// <summary>Force the QR code to regenerate immediately.</summary>
    public async Task RefreshAsync() => await GenerateQrCode();

    // ── Generation ────────────────────────────────────────────────────────────

    private async Task GenerateQrCode()
    {
        if (_isGenerating || !_jsInitialised || _jsModule is null) return;
        if (string.IsNullOrWhiteSpace(Data)) return;

        _isGenerating = true;
        _hasError     = false;
        _isLoading    = true;
        StateHasChanged();

        try
        {
            // Snapshot for change detection
            _lastData    = Data;
            _lastOptions = Options;
            _lastTheme   = Theme;

            // Resolve effective options
            var opts = Options ?? new MidQrGenerateOptions();

            // Auto-upgrade error level to H when locked — redirect URL is longer than raw data
            var errorLevel = opts.Locked is not null && opts.ErrorLevel < MidQrErrorLevel.H
                ? MidQrErrorLevel.H
                : opts.ErrorLevel;

            // Build the JS options object
            // (serde-wasm-bindgen on the Rust side deserialises camelCase)
            var jsOpts = BuildJsOptions(opts, errorLevel);

            // Generate — JS module handles locked wrapping internally
            var svg = await _jsModule.InvokeAsync<string>(
                "generateQrCode",
                Data,
                jsOpts,
                IsLocked ? opts.Locked!.RedirectUrl : null);

            // Inject SVG into the container div
            await _jsModule.InvokeVoidAsync(
                "setSvgContent",
                $"mid-qr-container-{_instanceId}",
                svg);

            // Notify parent
            if (OnGenerated.HasDelegate)
            {
                await OnGenerated.InvokeAsync(new MidQrResult
                {
                    Data        = Data,
                    SvgContent  = svg,
                    Theme       = Theme,
                    GeneratedAt = DateTime.UtcNow,
                    IsLocked    = IsLocked,
                });
            }
        }
        catch (Exception ex)
        {
            await SetError($"QR generation failed: {ex.Message}");
        }
        finally
        {
            _isLoading    = false;
            _isGenerating = false;
            StateHasChanged();
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /// <summary>
    /// Build the anonymous options object that is serialised to JS.
    /// Applies theme presets when the caller has not set Gradient/Logo explicitly.
    /// </summary>
    private static object BuildJsOptions(MidQrGenerateOptions opts, MidQrErrorLevel errorLevel)
    {
        return new
        {
            size        = opts.Size,
            darkColor   = opts.DarkColor,
            lightColor  = opts.LightColor,
            errorLevel  = errorLevel.ToString(),
            margin      = opts.Margin,
            gradient    = opts.Gradient is null ? null : new
            {
                direction = GradientDirectionToJs(opts.Gradient.Direction),
                color1    = opts.Gradient.Color1,
                color2    = opts.Gradient.Color2,
            },
            logo = opts.Logo is null ? null : new
            {
                url         = opts.Logo.Url,
                sizeRatio   = opts.Logo.SizeRatio,
                border      = opts.Logo.AddBorder ? new
                {
                    color  = opts.Logo.BorderColor,
                    width  = opts.Logo.BorderWidth,
                    radius = opts.Logo.BorderRadius,
                } : null,
            },
        };
    }

    private static string GradientDirectionToJs(MidQrGradientDirection d) => d switch
    {
        MidQrGradientDirection.LinearX  => "linear-x",
        MidQrGradientDirection.LinearY  => "linear-y",
        MidQrGradientDirection.Diagonal => "diagonal",
        MidQrGradientDirection.Radial   => "radial",
        _                               => "linear-x",
    };

    private async Task SetError(string message)
    {
        _hasError     = true;
        _errorMessage = message;
        if (OnError.HasDelegate)
            await OnError.InvokeAsync(message);
        StateHasChanged();
    }

    // ── Disposal ──────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        if (_jsModule is not null)
        {
            try   { await _jsModule.DisposeAsync(); }
            catch { /* suppress disposal exceptions */ }
        }
    }
}
