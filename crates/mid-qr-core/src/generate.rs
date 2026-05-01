//! SVG QR code generation.

use qrcode::render::svg;
use qrcode::{EcLevel, QrCode};

use crate::error::QrError;

// ── Public types ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorLevel { L, M, Q, H }

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
    pub fn from_str(s: &str) -> Self {
        match s.trim().to_uppercase().as_str() {
            "L" => ErrorLevel::L,
            "Q" => ErrorLevel::Q,
            "H" => ErrorLevel::H,
            _   => ErrorLevel::M,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientDirection { LinearX, LinearY, Diagonal, Radial }

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

#[derive(Debug, Clone)]
pub struct GradientOptions {
    pub direction: GradientDirection,
    pub color1:    String,
    pub color2:    String,
}

#[derive(Debug, Clone)]
pub struct LogoBorderOptions {
    pub color:  String,
    pub width:  u32,
    pub radius: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct LogoOptions {
    pub url:        String,
    pub size_ratio: f32,
    pub border:     Option<LogoBorderOptions>,
}

#[derive(Debug, Clone)]
pub struct GenerateOptions {
    pub data:        String,
    pub size:        u32,
    pub dark_color:  String,
    pub light_color: String,
    pub error_level: ErrorLevel,
    pub margin:      bool,
    pub gradient:    Option<GradientOptions>,
    pub logo:        Option<LogoOptions>,
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

// ── Validation ────────────────────────────────────────────────────────────────

fn validate_size(size: u32) -> Result<(), QrError> {
    if !(100..=4096).contains(&size) {
        Err(QrError::InvalidSize(size))
    } else {
        Ok(())
    }
}

fn validate_color(color: &str) -> Result<(), QrError> {
    let c = color.trim();
    if c.is_empty() {
        return Err(QrError::InvalidColor(color.to_string()));
    }
    if c.starts_with('#') {
        let hex = &c[1..];
        if !matches!(hex.len(), 3 | 6 | 8) || !hex.chars().all(|ch| ch.is_ascii_hexdigit()) {
            return Err(QrError::InvalidColor(color.to_string()));
        }
    }
    Ok(())
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

/// Extract a u32 from an SVG attribute value, stripping any "px" suffix.
///
/// The qrcode crate emits `width="312px"` — without stripping "px" the
/// parse fails and we fall back to opts.size which may differ slightly
/// from the actual rendered dimensions, causing logo miscentring.
fn extract_svg_attr_u32(svg: &str, attr: &str) -> Option<u32> {
    for quote in ['"', '\''] {
        let needle = format!(" {attr}={quote}");
        if let Some(start) = svg.find(&needle) {
            let rest = &svg[start + needle.len()..];
            if let Some(end) = rest.find(quote) {
                let raw = rest[..end]
                    .trim()
                    .trim_end_matches("px")
                    .trim();
                if let Ok(v) = raw.parse::<u32>() {
                    return Some(v);
                }
            }
        }
    }
    None
}

/// Build a `<defs>` block containing the gradient definition.
///
/// Uses `gradientUnits="userSpaceOnUse"` with pixel coordinates so the
/// gradient spans the whole QR image rather than each individual module rect.
fn build_gradient_def(id: &str, opts: &GradientOptions, svg_w: u32, svg_h: u32) -> String {
    match opts.direction {
        GradientDirection::Radial => {
            let cx = svg_w / 2;
            let cy = svg_h / 2;
            let r  = svg_w.min(svg_h) / 2;
            format!(
                r#"<defs><radialGradient id="{id}" cx="{cx}" cy="{cy}" r="{r}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></radialGradient></defs>"#,
                id = id, cx = cx, cy = cy, r = r, c1 = opts.color1, c2 = opts.color2,
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

/// Inject the gradient `<defs>` block and replace dark-color fills.
///
/// ── THE BUG THIS FIXES ──────────────────────────────────────────────────────
/// The qrcode crate emits an XML preamble before the <svg> element:
///
///   <?xml version="1.0" standalone="yes"?>
///   <!DOCTYPE svg PUBLIC ...>
///   <svg ...>
///
/// A naive `svg.find('>')` finds the `>` that closes the `<?xml?>` processing
/// instruction, so `<defs>` was being inserted BEFORE the `<svg>` element.
/// Browsers silently discard the broken structure and render a white rectangle.
///
/// Fix: locate `<svg` first, then find the closing `>` relative to that
/// position so the insertion always lands immediately inside the SVG root.
fn apply_gradient(mut svg: String, dark_color: &str, id: &str, def: &str) -> String {
    // Find the position right after the closing > of the <svg ...> opening tag.
    // We must search from the position of "<svg" to skip any preceding
    // <?xml?> or <!DOCTYPE> nodes whose ">" would otherwise be found first.
    let insert_pos = svg
        .find("<svg")
        .and_then(|svg_tag_start| {
            svg[svg_tag_start..]
                .find('>')
                .map(|rel| svg_tag_start + rel + 1)
        });

    if let Some(pos) = insert_pos {
        svg.insert_str(pos, def);
    }

    // Replace every fill="<dark_color>" with fill="url(#<id>)".
    // The background rect uses light_color so it is unaffected.
    let from = format!(r#"fill="{}""#, dark_color);
    let to   = format!(r#"fill="url(#{id})""#);
    svg.replace(&from, &to)
}

/// Build the logo and its optional border as SVG elements.
fn build_logo_elements(opts: &LogoOptions, svg_w: u32, svg_h: u32) -> String {
    let ratio     = opts.size_ratio.clamp(0.10, 0.35);
    let logo_size = ((svg_w.min(svg_h) as f32) * ratio) as u32;
    let logo_x    = (svg_w - logo_size) / 2;
    let logo_y    = (svg_h - logo_size) / 2;
    let pad: u32  = 6;
    let bg_x      = logo_x.saturating_sub(pad);
    let bg_y      = logo_y.saturating_sub(pad);
    let bg_w      = logo_size + pad * 2;
    let bg_h      = logo_size + pad * 2;

    let mut out = String::with_capacity(512);

    out.push_str(&format!(
        r#"<rect x="{bg_x}" y="{bg_y}" width="{bg_w}" height="{bg_h}" fill="white" rx="3" ry="3"/>"#,
        bg_x = bg_x, bg_y = bg_y, bg_w = bg_w, bg_h = bg_h,
    ));

    out.push_str(&format!(
        r#"<image href="{url}" x="{x}" y="{y}" width="{w}" height="{h}" preserveAspectRatio="xMidYMid meet"/>"#,
        url = opts.url, x = logo_x, y = logo_y, w = logo_size, h = logo_size,
    ));

    if let Some(border) = &opts.border {
        let rx_attr = border
            .radius
            .map(|r| format!(r#" rx="{r}" ry="{r}""#))
            .unwrap_or_default();
        out.push_str(&format!(
            r#"<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="{color}" stroke-width="{sw}"{rx}/>"#,
            x = logo_x, y = logo_y, w = logo_size, h = logo_size,
            color = border.color, sw = border.width, rx = rx_attr,
        ));
    }

    out
}

// ── Public API ────────────────────────────────────────────────────────────────

pub fn generate(opts: &GenerateOptions) -> Result<String, QrError> {
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

    let ec: EcLevel = opts.error_level.into();
    let code = QrCode::with_error_correction_level(opts.data.as_bytes(), ec)
        .map_err(|e| QrError::EncodingError(e.to_string()))?;

    let mut svg = code
        .render()
        .min_dimensions(opts.size, opts.size)
        .quiet_zone(opts.margin)
        .dark_color(svg::Color(&opts.dark_color))
        .light_color(svg::Color(&opts.light_color))
        .build();

    // Extract actual rendered dimensions — the renderer rounds up to fit
    // whole modules, so the SVG may be slightly larger than opts.size.
    // The "px" suffix is stripped inside extract_svg_attr_u32.
    let svg_w = extract_svg_attr_u32(&svg, "width").unwrap_or(opts.size);
    let svg_h = extract_svg_attr_u32(&svg, "height").unwrap_or(opts.size);

    if let Some(grad) = &opts.gradient {
        let def = build_gradient_def("midQrGrad", grad, svg_w, svg_h);
        svg = apply_gradient(svg, &opts.dark_color, "midQrGrad", &def);
    }

    if let Some(logo) = &opts.logo {
        let elements = build_logo_elements(logo, svg_w, svg_h);
        match svg.rfind("</svg>") {
            Some(pos) => svg.insert_str(pos, &elements),
            None => return Err(QrError::SvgError(
                "Rendered SVG is missing closing </svg> tag".to_string(),
            )),
        }
    }

    Ok(svg)
        }
