namespace MidQr.Blazor;

/// <summary>
/// Optional visual element provider for the mid-qr Blazor components.
///
/// Implement this interface and register it in DI to supply custom icons
/// and SVGs from your existing VisualElementsService.
/// If not registered, components use built-in inline SVG fallbacks automatically.
///
/// ── Adapting VisualElementsService ──────────────────────────────────────────
///
/// Create an adapter in your app:
///
/// <code>
/// using MidQr.Blazor;
/// using YourApp.Services.VisualElements;
/// using YourApp.Domain.Enums;
///
/// public sealed class MidQrVisualAdapter : IMidQrIconProvider
/// {
///     private readonly IVisualElementsService _vis;
///     public MidQrVisualAdapter(IVisualElementsService vis) => _vis = vis;
///
///     public Task&lt;string&gt; GetLoadingSpinnerSvgAsync()
///         => _vis.GetSvgAsync(SvgType.Loading);               // or closest equivalent
///
///     public Task&lt;string&gt; GetErrorIconSvgAsync()
///         => _vis.GetSvgAsync(SvgType.Warning);
///
///     public Task&lt;string&gt; GetLockedIconSvgAsync()
///         => _vis.GetSvgAsync(SvgType.Lock);                  // add to your SvgType enum if needed
///
///     public Task&lt;string&gt; GetScanOverlaySvgAsync()
///         => _vis.GetSvgAsync(SvgType.QrScanOverlay);         // add to your SvgType enum if needed
/// }
/// </code>
///
/// Register in Program.cs:
/// <code>
/// builder.Services.AddScoped&lt;IMidQrIconProvider, MidQrVisualAdapter&gt;();
/// </code>
///
/// If IMidQrIconProvider is not registered, DefaultMidQrIconProvider is used
/// automatically — no action required.
/// </summary>
public interface IMidQrIconProvider
{
    /// <summary>SVG shown in the loading overlay while the WASM loads or the QR generates.</summary>
    Task<string> GetLoadingSpinnerSvgAsync();

    /// <summary>SVG shown when generation or WASM initialisation fails.</summary>
    Task<string> GetErrorIconSvgAsync();

    /// <summary>SVG badge shown on locked QR codes to signal restricted scanning.</summary>
    Task<string> GetLockedIconSvgAsync();

    /// <summary>SVG corner-frame overlay rendered inside the scanner viewport.</summary>
    Task<string> GetScanOverlaySvgAsync();
}

/// <summary>
/// Default icon provider — pure inline SVG, zero external dependencies.
/// Automatically used when IMidQrIconProvider is not registered by the app.
/// </summary>
public sealed class DefaultMidQrIconProvider : IMidQrIconProvider
{
    public Task<string> GetLoadingSpinnerSvgAsync() => Task.FromResult(
        """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83
                   M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
        """);

    public Task<string> GetErrorIconSvgAsync() => Task.FromResult(
        """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        """);

    public Task<string> GetLockedIconSvgAsync() => Task.FromResult(
        """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
        """);

    public Task<string> GetScanOverlaySvgAsync() => Task.FromResult(
        """
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 238 238"
             preserveAspectRatio="none" fill="none"
             stroke="#4fc3f7" stroke-width="4"
             stroke-linecap="round" stroke-linejoin="round">
          <path d="M31 2H10a8 8 0 0 0-8 8v21
                   M207 2h21a8 8 0 0 1 8 8v21
                   m0 176v21a8 8 0 0 1-8 8h-21
                   m-176 0H10a8 8 0 0 1-8-8v-21"/>
        </svg>
        """);
}
