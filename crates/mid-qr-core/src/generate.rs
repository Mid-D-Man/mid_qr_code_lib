//! SVG QR code generation.
//!
//! Key design decisions
//! ─────────────────────
//! 1. We extract the *actual* rendered SVG width/height after generation so
//!    that logo centering and gradient coordinates are based on the real
//!    output dimensions, not the requested `size` hint (which the renderer
//!    may round up to fit whole modules).
//!
//! 2. Gradients use `gradientUnits="userSpaceOnUse"` with pixel coordinates
//!    so the gradient spans the whole QR image, not each individual module
//!    rect.
//!
//! 3. The quiet-zone (margin) is binary: present (default 4 modules) or
//!    absent.  The qrcode crate does not expose a way to set a custom module
//!    count for the quiet zone; any post-hoc viewBox manipulation is fragile
//!    and has been removed.

use qrcode::render::svg;
use qrcode::{EcLevel, QrCode};

use crate::error::QrError;

// ── Public types ─────────────────────────────────────────────────────────────

/// QR error-correction level.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorLevel {
    /// ~7 % recovery
    L,
    /// ~15 % recovery (default)
    M,
    /// ~25 % recovery
    Q,
    /// ~30 % recovery – required when embedding a logo
    H,
}

impl From<ErrorLevel> for EcLevel {
    fn from(l: ErrorLevel) -> Self {
        match l {
            ErrorLevel::L => EcLevel::L,
            ErrorLevel::M => EcLevel::M,
            ErrorLevel::Q => EcLevel::Q,
            ErrorLevel::H => EcLevel::H,
        }
    }
}

impl ErrorLevel {
    /// Parse from a string slice (`"L"`, `"M"`, `"Q"`, `"H"`).
    /// Defaults to `M` on unrecognised input.
    pub fn from_str(s: &str) -> Self {
        match s.trim().to_uppercase().as_str() {
            "L" => ErrorLevel::L,
            "Q" => ErrorLevel::Q,
            "H" => ErrorLevel::H,
            _ => ErrorLevel::M,
        }
    }
}

/// Direction for the gradient fill applied to dark modules.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientDirection {
    LinearX,
    LinearY,
    Diagonal,
    Radial,
}

impl GradientDirection {
    pub fn from_str(s: &str) -> Self {
        match s.trim() {
            "linear-y" => GradientDirection::LinearY,
            "diagonal" => GradientDirection::Diagonal,
            "radial"   => GradientDirection::Radial,
            _          => GradientDirection::LinearX,
        }
    }
}

/// Options controlling the gradient overlay on dark QR modules.
#[derive(Debug, Clone)]
pub struct GradientOptions {
    pub direction: GradientDirection,
    /// CSS color for the gradient start (e.g. `"#FF0000"`).
    pub color1: String,
    /// CSS color for the gradient end.
    pub color2: String,
}

/// Border drawn around the embedded logo.
#[derive(Debug, Clone)]
pub struct LogoBorderOptions {
    /// Border stroke color.
    pub color: String,
    /// Border stroke width in SVG pixels.
    pub width: u32,
    /// Optional corner radius in SVG pixels.
    pub radius: Option<u32>,
}

/// Options controlling the logo embedded at the centre of the QR code.
///
/// Use `ErrorLevel::H` when embedding a logo – the extra error-correction
/// capacity compensates for the modules the logo obscures.
#[derive(Debug, Clone)]
pub struct LogoOptions {
    /// URL or data-URI of the logo image.
    pub url: String,
    /// Logo width/height as a fraction of the QR code's shorter side.
    /// Clamped to the range 0.10 – 0.35.  Default: 0.25.
    pub size_ratio: f32,
    /// Optional decorative border around the logo.
    pub border: Option<LogoBorderOptions>,
}

/// Full set of options for [`generate`].
#[derive(Debug, Clone)]
pub struct GenerateOptions {
    /// Content to encode.
    pub data: String,
    /// Desired output size in SVG pixels.  The renderer may produce a
    /// slightly larger image to accommodate whole modules.
    pub size: u32,
    /// CSS color for the dark (data) modules.
    pub dark_color: String,
    /// CSS color for the light (background) modules.
    pub light_color: String,
    pub error_level: ErrorLevel,
    /// Enable the quiet-zone (recommended).  `false` disables it.
    /// The module count of the quiet zone is fixed at 4 by the renderer.
    pub margin: bool,
    /// Apply a gradient to the dark modules.
    pub gradient: Option<GradientOptions>,
    /// Embed a logo in the centre of the QR code.
    pub logo: Option<LogoOptions>,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        GenerateOptions {
            data:        String::new(),
            size:        300,
            dark_color:  "#000000".to_string(),
            light_color: "#FFFFFF".to_string(),
            error_level: ErrorLevel::M,
            margin:      true,
            gradient:    None,
            logo:        None,
        }
    }
}

// ── Validation ───────────────────────────────────────────────────────────────

fn validate_size(size: u32) -> Result<(), QrError> {
    if !(100..=4096).contains(&size) {
        Err(QrError::InvalidSize(size))
    } else {
        Ok(())
    }
}

/// Accepts:
/// - hex colors: `#RGB`, `#RRGGBB`, `#RRGGBBAA`
/// - anything not starting with `#` is treated as a CSS named color and
///   passed through (validation of named colors is left to the browser).
fn validate_color(color: &str) -> Result<(), QrError> {
    let c = color.trim();
    if c.is_empty() {
        return Err(QrError::InvalidColor(color.to_string()));
    }
    if c.starts_with('#') {
        let hex = &c[1..];
        let valid_len = matches!(hex.len(), 3 | 6 | 8);
        let valid_chars = hex.chars().all(|ch| ch.is_ascii_hexdigit());
        if !valid_len || !valid_chars {
            return Err(QrError::InvalidColor(color.to_string()));
        }
    }
    Ok(())
}

// ── SVG helpers ──────────────────────────────────────────────────────────────

/// Extract a `u32` value from an SVG attribute like `width="312"`.
/// Handles both double-quote and single-quote forms.
fn extract_svg_attr_u32(svg: &str, attr: &str) -> Option<u32> {
    for quote in ['"', '\''] {
        let needle = format!(" {attr}={quote}");
        if let Some(start) = svg.find(&needle) {
            let rest = &svg[start + needle.len()..];
            if let Some(end) = rest.find(quote) {
                if let Ok(v) = rest[..end].trim().parse::<u32>() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Build the SVG `<defs>` block containing either a `<linearGradient>` or a
/// `<radialGradient>`.
///
/// Using `gradientUnits="userSpaceOnUse"` with explicit pixel coordinates
/// ensures the gradient spans the *entire* QR image, not each individual
/// module rect (which would happen with the default `objectBoundingBox`).
fn build_gradient_def(
    id: &str,
    opts: &GradientOptions,
    svg_w: u32,
    svg_h: u32,
) -> String {
    match opts.direction {
        GradientDirection::Radial => {
            let cx = svg_w / 2;
            let cy = svg_h / 2;
            let r  = svg_w.min(svg_h) / 2;
            format!(
                r#"<defs><radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></radialGradient></defs>"#,
                id = id, cx = cx, cy = cy, r = r,
                c1 = opts.color1, c2 = opts.color2,
            )
        }
        GradientDirection::LinearX => format!(
            r#"<defs><linearGradient id="{id}" x1="0" y1="0" x2="{w}" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient></defs>"#,
            id = id, w = svg_w, c1 = opts.color1, c2 = opts.color2,
        ),
        GradientDirection::LinearY => format!(
            r#"<defs><linearGradient id="{id}" x1="0" y1="0" x2="0" y2="{h}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient></defs>"#,
            id = id, h = svg_h, c1 = opts.color1, c2 = opts.color2,
        ),
        GradientDirection::Diagonal => format!(
            r#"<defs><linearGradient id="{id}" x1="0" y1="0" x2="{w}" y2="{h}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient></defs>"#,
            id = id, w = svg_w, h = svg_h, c1 = opts.color1, c2 = opts.color2,
        ),
    }
}

/// Inject the gradient `<defs>` block into the SVG and replace every
/// `fill="dark_color"` attribute with `fill="url(#id)"`.
///
/// The background rect uses `light_color`, never `dark_color`, so this
/// replacement is safe without any special-casing.
fn apply_gradient(mut svg: String, dark_color: &str, id: &str, def: &str) -> String {
    // Insert <defs> immediately after the opening <svg ...> tag
    if let Some(pos) = svg.find('>') {
        svg.insert_str(pos + 1, def);
    }

    // Replace dark fills — use exact attribute syntax to avoid partial matches
    let from = format!(r#"fill="{}""#, dark_color);
    let to   = format!(r#"fill="url(#{})""#, id);
    svg.replace(&from, &to)
}

/// Build SVG markup for the logo and its optional border.
///
/// `svg_w` / `svg_h` are the *actual* rendered SVG dimensions (extracted
/// from the SVG string), NOT the requested `size` parameter.  Using the real
/// dimensions is what fixes the off-centre logo bug in the original code.
fn build_logo_elements(opts: &LogoOptions, svg_w: u32, svg_h: u32) -> String {
    let ratio     = opts.size_ratio.clamp(0.10, 0.35);
    let logo_size = ((svg_w.min(svg_h) as f32) * ratio) as u32;

    // True pixel centre of the rendered SVG
    let logo_x = (svg_w - logo_size) / 2;
    let logo_y = (svg_h - logo_size) / 2;

    // Padding around the logo for the white background block.
    // 6 px each side gives a small breathing room without obscuring too many
    // QR modules.
    let pad: u32 = 6;
    let bg_x = logo_x.saturating_sub(pad);
    let bg_y = logo_y.saturating_sub(pad);
    let bg_w = logo_size + pad * 2;
    let bg_h = logo_size + pad * 2;

    let mut out = String::with_capacity(512);

    // White background so logo sits cleanly over the modules
    out.push_str(&format!(
        r#"<rect x="{bg_x}" y="{bg_y}" width="{bg_w}" height="{bg_h}" fill="white" rx="3" ry="3"/>"#,
        bg_x = bg_x, bg_y = bg_y, bg_w = bg_w, bg_h = bg_h,
    ));

    // Logo image element
    // `xMidYMid meet` — scale to fit while preserving aspect ratio and
    // keeping the image centred in the allocated box.
    out.push_str(&format!(
        r#"<image href="{url}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>"#,
        url = opts.url,
        x   = logo_x,
        y   = logo_y,
        w   = logo_size,
        h   = logo_size,
    ));

    // Optional border rect drawn on top of the logo
    if let Some(border) = &opts.border {
        let rx_attr = border
            .radius
            .map(|r| format!(r#" rx="{r}" ry="{r}""#))
            .unwrap_or_default();
        out.push_str(&format!(
            r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{color}" stroke-width="{sw}"{rx}/>"#,
            x     = logo_x,
            y     = logo_y,
            w     = logo_size,
            h     = logo_size,
            color = border.color,
            sw    = border.width,
            rx    = rx_attr,
        ));
    }

    out
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Generate a QR code and return it as an SVG string.
///
/// # Errors
/// Returns [`QrError`] if validation fails or the QR encoder cannot fit the
/// data into a code (e.g. data too long for the chosen error-correction level).
pub fn generate(opts: &GenerateOptions) -> Result<String, QrError> {
    // ── Validate ────────────────────────────────────────────────────────────
    if opts.data.is_empty() {
        return Err(QrError::EmptyData);
    }
    validate_size(opts.size)?;
    validate_color(&opts.dark_color)?;
    validate_color(&opts.light_color)?;

    if let Some(g) = &opts.gradient {
        validate_color(&g.color1)?;
        validate_color(&g.color2)?;
    }

    // ── Encode ──────────────────────────────────────────────────────────────
    let ec: EcLevel = opts.error_level.into();
    let code = QrCode::with_error_correction_level(opts.data.as_bytes(), ec)
        .map_err(|e| QrError::EncodingError(e.to_string()))?;

    // ── Render base SVG ─────────────────────────────────────────────────────
    let mut svg = code
        .render()
        .min_dimensions(opts.size, opts.size)
        .quiet_zone(opts.margin)
        .dark_color(svg::Color(&opts.dark_color))
        .light_color(svg::Color(&opts.light_color))
        .build();

    // ── Extract actual rendered dimensions ──────────────────────────────────
    // The renderer may produce an image slightly larger than `opts.size` to
    // fit whole modules.  All subsequent calculations use these real values.
    let svg_w = extract_svg_attr_u32(&svg, "width").unwrap_or(opts.size);
    let svg_h = extract_svg_attr_u32(&svg, "height").unwrap_or(opts.size);

    // ── Apply gradient ──────────────────────────────────────────────────────
    if let Some(grad) = &opts.gradient {
        let def = build_gradient_def("midQrGrad", grad, svg_w, svg_h);
        svg = apply_gradient(svg, &opts.dark_color, "midQrGrad", &def);
    }

    // ── Apply logo ───────────────────────────────────────────────────────────
    if let Some(logo) = &opts.logo {
        let elements = build_logo_elements(logo, svg_w, svg_h);
        // Append just before the closing </svg> tag so the logo layers on top
        match svg.rfind("</svg>") {
            Some(pos) => svg.insert_str(pos, &elements),
            None => return Err(QrError::SvgError(
                "Rendered SVG is missing closing </svg> tag".to_string(),
            )),
        }
    }

    Ok(svg)
}
