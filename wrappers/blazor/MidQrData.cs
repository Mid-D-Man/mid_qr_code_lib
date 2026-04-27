namespace MidQr.Blazor;

// ── Enums ─────────────────────────────────────────────────────────────────────

/// <summary>QR error-correction level.</summary>
public enum MidQrErrorLevel { L, M, Q, H }

/// <summary>Gradient direction applied to dark modules.</summary>
public enum MidQrGradientDirection { LinearX, LinearY, Diagonal, Radial }

/// <summary>Visual theme preset — convenience shorthand over full options.</summary>
public enum MidQrTheme { Standard, Gradient, Branded, GradientWithLogo }

// ── Option records ─────────────────────────────────────────────────────────────

/// <summary>Gradient fill applied to dark QR modules.</summary>
public record MidQrGradientOptions
{
    public MidQrGradientDirection Direction { get; init; } = MidQrGradientDirection.Radial;
    /// <summary>CSS color at the gradient start.</summary>
    public string Color1 { get; init; } = "#007BFF";
    /// <summary>CSS color at the gradient end.</summary>
    public string Color2 { get; init; } = "#00BFFF";
}

/// <summary>Logo embedded at the centre of the QR code.</summary>
public record MidQrLogoOptions
{
    /// <summary>URL or data-URI of the logo image.</summary>
    public string Url { get; init; } = string.Empty;
    /// <summary>
    /// Logo width/height as a fraction of the QR code's shorter side.
    /// Clamped to 0.10–0.35 by the Rust renderer.  Default: 0.25
    /// </summary>
    public float SizeRatio { get; init; } = 0.25f;
    public bool   AddBorder    { get; init; } = true;
    public string BorderColor  { get; init; } = "#FFFFFF";
    public int    BorderWidth  { get; init; } = 2;
    public int    BorderRadius { get; init; } = 4;
}

/// <summary>
/// Locked-mode options.
///
/// When set, the generated QR encodes the real data inside a URL of the form:
///   https://redirect-url?mid-qr-v1=&lt;base64(json)&gt;
///
/// External camera apps scan the QR and open the redirect URL in a browser.
/// MidQrScanner in locked mode unwraps the JSON and surfaces the real payload.
///
/// Always use ErrorLevel H when locking — the redirect URL wrapper is longer
/// than the original data, consuming more QR capacity.
/// </summary>
public record MidQrLockedOptions
{
    /// <summary>
    /// URL that external scanners are redirected to.
    /// Should serve a page that instructs the user to use the app.
    /// Example: "https://your-app.com/scan-redirect"
    /// </summary>
    public string RedirectUrl { get; init; } = string.Empty;
}

/// <summary>Full set of options for QR code generation.</summary>
public record MidQrGenerateOptions
{
    /// <summary>Desired output size in SVG pixels.  Default: 300</summary>
    public int Size { get; init; } = 300;
    /// <summary>CSS color for dark (data) modules.  Default: "#000000"</summary>
    public string DarkColor  { get; init; } = "#000000";
    /// <summary>CSS color for light (background) modules.  Default: "#FFFFFF"</summary>
    public string LightColor { get; init; } = "#FFFFFF";
    /// <summary>Error-correction level.  Default: M.  Use H with logos or locked mode.</summary>
    public MidQrErrorLevel ErrorLevel { get; init; } = MidQrErrorLevel.M;
    /// <summary>Include the quiet zone (blank border).  Default: true</summary>
    public bool Margin { get; init; } = true;
    /// <summary>Apply a gradient fill to the dark modules.</summary>
    public MidQrGradientOptions? Gradient { get; init; }
    /// <summary>Embed a logo at the centre.  Requires ErrorLevel H.</summary>
    public MidQrLogoOptions? Logo { get; init; }
    /// <summary>
    /// When set, wraps the data for locked-mode scanning.
    /// Automatically upgrades ErrorLevel to H if it is lower.
    /// </summary>
    public MidQrLockedOptions? Locked { get; init; }
}

// ── Result / event types ──────────────────────────────────────────────────────

/// <summary>Data passed to the OnGenerated callback.</summary>
public class MidQrResult
{
    public string     Id          { get; set; } = Guid.NewGuid().ToString("N");
    /// <summary>The original data passed to the component (before locked wrapping).</summary>
    public string     Data        { get; set; } = string.Empty;
    /// <summary>The full SVG string of the rendered QR code.</summary>
    public string     SvgContent  { get; set; } = string.Empty;
    public MidQrTheme Theme       { get; set; } = MidQrTheme.Standard;
    public DateTime   GeneratedAt { get; set; } = DateTime.UtcNow;
    public bool       IsLocked    { get; set; }
}

/// <summary>Data passed to OnQrCodeDetected from MidQrScanner.</summary>
public class MidQrScanResult
{
    /// <summary>
    /// The decoded text.
    /// In locked mode this is the unwrapped actual payload, not the raw URL.
    /// </summary>
    public string   Data      { get; set; } = string.Empty;
    /// <summary>Whether the locked-mode unwrap was applied.</summary>
    public bool     WasLocked { get; set; }
    public DateTime ScannedAt { get; set; } = DateTime.UtcNow;
}
