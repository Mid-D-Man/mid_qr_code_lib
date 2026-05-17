//! SVG QR code generation — full style customization.
//!
//! New features
//! ─────────────────────────────────────────────────────────────────
//! • Six module styles   (square, dot, rounded, extra-rounded,
//!                        classy, classy-rounded)
//! • Three corner-square styles for finder-pattern outer rings
//! • Two   corner-dot   styles for finder-pattern inner dots
//! • Independent eye colours (outer ring vs inner dot)
//! • Eight decorative frame styles with optional text label
//! • Gradient fills — userSpaceOnUse, frame-aware
//! • Logo embedding (unchanged, re-implemented with frame-aware coords)

use qrcode::{EcLevel, QrCode, Color as QrColor};
use crate::error::QrError;

// ═══════════════════════════════════════════════════════════════════
//  ENUMS
// ═══════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorLevel { L, M, Q, H }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GradientDirection { LinearX, LinearY, Diagonal, Radial }

/// Style applied to every data module (the individual QR "dots").
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ModuleStyle {
    #[default]
    Square,
    Dot,
    Rounded,
    ExtraRounded,
    /// Square with top-right + bottom-left corners rounded (diagonal pair).
    Classy,
    /// Uniform soft rounding — sits between Rounded and ExtraRounded visually.
    ClassyRounded,
}

/// Style for the outer 7×7 ring of each finder-pattern eye.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CornerSquareStyle {
    #[default]
    Square,
    ExtraRounded,
    Dot,
}

/// Style for the inner 3×3 dot of each finder-pattern eye.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CornerDotStyle {
    #[default]
    Square,
    Dot,
}

// ═══════════════════════════════════════════════════════════════════
//  STRUCTS
// ═══════════════════════════════════════════════════════════════════

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

/// Independent colours for the two parts of each finder-pattern eye.
#[derive(Debug, Clone)]
pub struct EyeColorOptions {
    /// Colour of the outer 7×7 ring.
    pub outer: String,
    /// Colour of the inner 3×3 dot.
    pub inner: String,
}

/// Decorative frame drawn around the QR code with an optional text label.
///
/// Styles
/// ──────
/// 0 = none  
/// 1 = square background, text below  
/// 2 = rounded background, text below  
/// 3 = square background, text above  
/// 4 = rounded background, text above  
/// 5 = square border only + rounded badge/tab below  
/// 6 = rounded border + rounded badge/tab below  
/// 7 = thick square border, no text  
/// 8 = double square border, no text
#[derive(Debug, Clone)]
pub struct FrameOptions {
    pub style:      u32,
    pub color:      String,
    pub text:       String,
    pub text_color: String,
}

impl Default for FrameOptions {
    fn default() -> Self {
        Self {
            style:      0,
            color:      "#000000".to_string(),
            text:       "Scan Me!".to_string(),
            text_color: "#ffffff".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct GenerateOptions {
    pub data:                String,
    pub size:                u32,
    pub dark_color:          String,
    pub light_color:         String,
    pub error_level:         ErrorLevel,
    pub margin:              bool,
    pub gradient:            Option<GradientOptions>,
    pub logo:                Option<LogoOptions>,
    pub module_style:        ModuleStyle,
    pub corner_square_style: CornerSquareStyle,
    pub corner_dot_style:    CornerDotStyle,
    pub eye_color:           Option<EyeColorOptions>,
    pub frame:               Option<FrameOptions>,
}

impl Default for GenerateOptions {
    fn default() -> Self {
        GenerateOptions {
            data:                String::new(),
            size:                300,
            dark_color:          "#000000".to_string(),
            light_color:         "#FFFFFF".to_string(),
            error_level:         ErrorLevel::M,
            margin:              true,
            gradient:            None,
            logo:                None,
            module_style:        ModuleStyle::Square,
            corner_square_style: CornerSquareStyle::Square,
            corner_dot_style:    CornerDotStyle::Square,
            eye_color:           None,
            frame:               None,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  FROM / PARSE IMPLS
// ═══════════════════════════════════════════════════════════════════

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

impl ModuleStyle {
    pub fn from_str(s: &str) -> Self {
        match s.trim() {
            "dot"            => ModuleStyle::Dot,
            "rounded"        => ModuleStyle::Rounded,
            "extra-rounded"  => ModuleStyle::ExtraRounded,
            "classy"         => ModuleStyle::Classy,
            "classy-rounded" => ModuleStyle::ClassyRounded,
            _                => ModuleStyle::Square,
        }
    }
}

impl CornerSquareStyle {
    pub fn from_str(s: &str) -> Self {
        match s.trim() {
            "extra-rounded" => CornerSquareStyle::ExtraRounded,
            "dot"           => CornerSquareStyle::Dot,
            _               => CornerSquareStyle::Square,
        }
    }
}

impl CornerDotStyle {
    pub fn from_str(s: &str) -> Self {
        match s.trim() {
            "dot" => CornerDotStyle::Dot,
            _     => CornerDotStyle::Square,
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  VALIDATION
// ═══════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════
//  SVG PATH HELPERS
// ═══════════════════════════════════════════════════════════════════

/// Rounded rectangle as an SVG path string (clockwise, arc corners).
fn rounded_rect_path(x: f32, y: f32, w: f32, h: f32, r: f32) -> String {
    let r = r.min(w * 0.499).min(h * 0.499);
    format!(
        "M{:.3} {:.3}h{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}\
         v{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}\
         h{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}\
         v{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}Z",
        x + r, y,
        w - 2.0 * r, r, r, r, r,
        h - 2.0 * r, r, r, -r, r,
        -(w - 2.0 * r), r, r, -r, -r,
        -(h - 2.0 * r), r, r, r, -r,
    )
}

/// Circle as a two-arc SVG path (works inside compound evenodd paths).
fn circle_path(cx: f32, cy: f32, r: f32) -> String {
    format!(
        "M{:.3} {:.3}a{:.3} {:.3} 0 1 0 {:.3} 0a{:.3} {:.3} 0 1 0 {:.3} 0Z",
        cx - r, cy,
        r, r, 2.0 * r,
        r, r, -(2.0 * r),
    )
}

// ═══════════════════════════════════════════════════════════════════
//  MODULE RENDERING
// ═══════════════════════════════════════════════════════════════════

/// SVG path fragment for a single dark data module at pixel position (x, y),
/// module size `m`, with the chosen style.
fn module_path(x: f32, y: f32, m: f32, style: ModuleStyle) -> String {
    match style {
        ModuleStyle::Square => {
            format!("M{:.3} {:.3}H{:.3}V{:.3}H{:.3}Z", x, y, x + m, y + m, x)
        }

        ModuleStyle::Dot => {
            circle_path(x + m * 0.5, y + m * 0.5, m * 0.45)
        }

        ModuleStyle::Rounded => {
            rounded_rect_path(x, y, m, m, m * 0.25)
        }

        ModuleStyle::ExtraRounded => {
            rounded_rect_path(x, y, m, m, m * 0.45)
        }

        // Diagonal pair: top-right + bottom-left corners rounded;
        // top-left + bottom-right remain sharp.
        //
        // Path (clockwise from top-left):
        //   M(x, y)                    ← top-left sharp
        //   H(x+m-r)                   ← along top edge
        //   a r r 0 0 1 r r            ← top-right arc → (x+m, y+r)
        //   V(y+m)                     ← right side down → (x+m, y+m) sharp
        //   H(x+r)                     ← along bottom
        //   a r r 0 0 1 -r -r          ← bottom-left arc → (x, y+m-r)
        //   Z                          ← closes left edge
        ModuleStyle::Classy => {
            let r = m * 0.35;
            format!(
                "M{:.3} {:.3}H{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}\
                 V{:.3}H{:.3}a{:.3} {:.3} 0 0 1 {:.3} {:.3}Z",
                x, y,
                x + m - r, r, r, r, r,
                y + m,
                x + r, r, r, -r, -r,
            )
        }

        ModuleStyle::ClassyRounded => {
            rounded_rect_path(x, y, m, m, m * 0.32)
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
//  FINDER PATTERN (EYE) RENDERING
// ═══════════════════════════════════════════════════════════════════

/// Render one complete finder-pattern eye.
///
/// `(ox, oy)` = top-left pixel corner of the 7×7 eye area.  
/// `ms`       = module size in pixels.
fn render_finder(
    ox: f32,
    oy: f32,
    ms: f32,
    csq:  CornerSquareStyle,
    cdot: CornerDotStyle,
    outer_fill: &str,
    inner_fill: &str,
) -> String {
    let mut out = String::with_capacity(512);

    // ── Outer ring: hollow 7×7 with 5×5 hole (fill-rule evenodd) ──────────
    let outer_d = match csq {
        CornerSquareStyle::Square => {
            let op = format!(
                "M{:.3} {:.3}H{:.3}V{:.3}H{:.3}Z",
                ox, oy, ox + 7.0 * ms, oy + 7.0 * ms, ox
            );
            let ip = format!(
                "M{:.3} {:.3}H{:.3}V{:.3}H{:.3}Z",
                ox + ms, oy + ms, ox + 6.0 * ms, oy + 6.0 * ms, ox + ms
            );
            format!("{}{}", op, ip)
        }

        CornerSquareStyle::ExtraRounded => {
            let r_out = ms * 1.4;
            let r_in  = ms * 0.8;
            format!(
                "{}{}",
                rounded_rect_path(ox,       oy,       7.0 * ms, 7.0 * ms, r_out),
                rounded_rect_path(ox + ms, oy + ms, 5.0 * ms, 5.0 * ms, r_in),
            )
        }

        CornerSquareStyle::Dot => {
            let cx = ox + 3.5 * ms;
            let cy = oy + 3.5 * ms;
            format!(
                "{}{}",
                circle_path(cx, cy, 3.5 * ms),
                circle_path(cx, cy, 2.5 * ms),
            )
        }
    };

    out.push_str(&format!(
        r#"<path d="{}" fill="{}" fill-rule="evenodd"/>"#,
        outer_d, outer_fill
    ));

    // ── Inner dot ──────────────────────────────────────────────────────────
    let cx = ox + 3.5 * ms;
    let cy = oy + 3.5 * ms;

    let dot_el = match cdot {
        CornerDotStyle::Square => format!(
            r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="{}"/>"#,
            ox + 2.0 * ms,
            oy + 2.0 * ms,
            3.0 * ms,
            3.0 * ms,
            inner_fill
        ),
        CornerDotStyle::Dot => format!(
            r#"<circle cx="{:.3}" cy="{:.3}" r="{:.3}" fill="{}"/>"#,
            cx, cy, 1.5 * ms, inner_fill
        ),
    };

    out.push_str(&dot_el);
    out
}

// ═══════════════════════════════════════════════════════════════════
//  GRADIENT DEFINITION
// ═══════════════════════════════════════════════════════════════════

/// Build the gradient `<linearGradient>` or `<radialGradient>` element string.
///
/// Coordinates use `gradientUnits="userSpaceOnUse"` so they sit correctly
/// in absolute SVG pixel space regardless of frame padding.
///
/// `(dx, dy)` = top-left pixel corner of the QR area (including quiet zone).
fn build_gradient_def(
    id:   &str,
    opts: &GradientOptions,
    w:    f32,
    h:    f32,
    dx:   f32,
    dy:   f32,
) -> String {
    let c1 = &opts.color1;
    let c2 = &opts.color2;
    match opts.direction {
        GradientDirection::Radial => {
            let cx = dx + w / 2.0;
            let cy = dy + h / 2.0;
            let r  = w.min(h) / 2.0;
            format!(
                r#"<radialGradient id="{id}" cx="{cx:.3}" cy="{cy:.3}" r="{r:.3}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></radialGradient>"#
            )
        }
        GradientDirection::LinearX => format!(
            r#"<linearGradient id="{id}" x1="{x1:.3}" y1="{y:.3}" x2="{x2:.3}" y2="{y:.3}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient>"#,
            x1 = dx, y = dy, x2 = dx + w
        ),
        GradientDirection::LinearY => format!(
            r#"<linearGradient id="{id}" x1="{x:.3}" y1="{y1:.3}" x2="{x:.3}" y2="{y2:.3}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient>"#,
            x = dx, y1 = dy, y2 = dy + h
        ),
        GradientDirection::Diagonal => format!(
            r#"<linearGradient id="{id}" x1="{x1:.3}" y1="{y1:.3}" x2="{x2:.3}" y2="{y2:.3}" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="{c1}"/><stop offset="100%" stop-color="{c2}"/></linearGradient>"#,
            x1 = dx, y1 = dy, x2 = dx + w, y2 = dy + h
        ),
    }
}

// ═══════════════════════════════════════════════════════════════════
//  LOGO
// ═══════════════════════════════════════════════════════════════════

fn build_logo_elements(
    logo:       &LogoOptions,
    qr_center_x: f32,
    qr_center_y: f32,
    qr_px:      f32,
) -> String {
    let ratio     = logo.size_ratio.clamp(0.10, 0.35);
    let logo_size = qr_px * ratio;
    let logo_x    = qr_center_x - logo_size * 0.5;
    let logo_y    = qr_center_y - logo_size * 0.5;
    let pad       = 6.0_f32;

    let mut out = String::with_capacity(512);

    // White backing so gradient/pattern doesn't bleed under logo
    out.push_str(&format!(
        r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="white" rx="3"/>"#,
        logo_x - pad,
        logo_y - pad,
        logo_size + pad * 2.0,
        logo_size + pad * 2.0,
    ));

    out.push_str(&format!(
        r#"<image href="{url}" x="{x:.3}" y="{y:.3}" width="{w:.3}" height="{h:.3}" preserveAspectRatio="xMidYMid meet"/>"#,
        url = logo.url, x = logo_x, y = logo_y, w = logo_size, h = logo_size
    ));

    if let Some(ref border) = logo.border {
        let rx_attr = border.radius
            .map(|r| format!(r#" rx="{r}""#))
            .unwrap_or_default();
        out.push_str(&format!(
            r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="none" stroke="{}" stroke-width="{}"{}/>"#,
            logo_x, logo_y, logo_size, logo_size,
            border.color, border.width, rx_attr
        ));
    }

    out
}

// ═══════════════════════════════════════════════════════════════════
//  FRAME — geometry helper
// ═══════════════════════════════════════════════════════════════════

struct FrameGeom {
    pad_x:     f32,
    pad_y_top: f32,
    pad_y_bot: f32,
}

fn frame_geom(style: u32, has_text: bool) -> FrameGeom {
    let base = 20.0_f32;
    let th   = if has_text { 52.0_f32 } else { base };

    match style {
        0 => FrameGeom { pad_x: 0.0, pad_y_top: 0.0, pad_y_bot: 0.0 },
        // full background, text below
        1 | 2 => FrameGeom { pad_x: base, pad_y_top: base, pad_y_bot: th },
        // full background, text above
        3 | 4 => FrameGeom { pad_x: base, pad_y_top: th, pad_y_bot: base },
        // border + badge, text in badge
        5 | 6 => FrameGeom { pad_x: base, pad_y_top: base, pad_y_bot: 72.0 },
        // borders only, no text area
        7 | 8 => FrameGeom { pad_x: 14.0, pad_y_top: 14.0, pad_y_bot: 14.0 },
        _     => FrameGeom { pad_x: base, pad_y_top: base, pad_y_bot: th },
    }
}

// ═══════════════════════════════════════════════════════════════════
//  FRAME — background / border elements (rendered BEFORE QR content)
// ═══════════════════════════════════════════════════════════════════

/// Returns SVG elements for the frame's colored areas and inner white rect.
/// Call this BEFORE rendering QR data modules.
fn render_frame_bg(
    svg_w:    f32,
    svg_h:    f32,
    qr_x:    f32,   // top-left of QR area (incl. quiet zone) in SVG coords
    qr_y:    f32,
    qr_size: f32,   // pixel size of the QR area (incl. quiet zone)
    opts:    &FrameOptions,
    light:   &str,
) -> String {
    if opts.style == 0 { return String::new(); }

    let mut out = String::with_capacity(400);

    // Slightly inset white area to keep a small colored gap around the QR
    let ip  = 6.0_f32;
    let wx  = qr_x  - ip;
    let wy  = qr_y  - ip;
    let ww  = qr_size + ip * 2.0;
    let wh  = qr_size + ip * 2.0;

    match opts.style {
        1 => {
            // Solid square background
            out.push_str(&format!(
                r#"<rect width="{:.3}" height="{:.3}" fill="{}"/>"#,
                svg_w, svg_h, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="{}"/>"#,
                wx, wy, ww, wh, light
            ));
        }
        2 => {
            // Rounded background
            let r = 22.0_f32;
            out.push_str(&format!(
                r#"<rect width="{:.3}" height="{:.3}" rx="{r}" fill="{}"/>"#,
                svg_w, svg_h, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="{}" fill="{}"/>"#,
                wx, wy, ww, wh, r * 0.5, light
            ));
        }
        3 => {
            // Solid square, text above
            out.push_str(&format!(
                r#"<rect width="{:.3}" height="{:.3}" fill="{}"/>"#,
                svg_w, svg_h, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="{}"/>"#,
                wx, wy, ww, wh, light
            ));
        }
        4 => {
            // Rounded, text above
            let r = 22.0_f32;
            out.push_str(&format!(
                r#"<rect width="{:.3}" height="{:.3}" rx="{r}" fill="{}"/>"#,
                svg_w, svg_h, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="{}" fill="{}"/>"#,
                wx, wy, ww, wh, r * 0.5, light
            ));
        }
        5 => {
            // Square border only + rounded badge tab below
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="none" stroke="{}" stroke-width="4"/>"#,
                wx - 3.0, wy - 3.0, ww + 6.0, wh + 6.0, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" fill="{}"/>"#,
                wx, wy, ww, wh, light
            ));
            // Badge
            let bw = ww * 0.78;
            let bh = 44.0_f32;
            let bx = (svg_w - bw) * 0.5;
            let by = qr_y + qr_size + 10.0;
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="22" fill="{}"/>"#,
                bx, by, bw, bh, opts.color
            ));
        }
        6 => {
            // Rounded border + rounded badge tab
            let r = 14.0_f32;
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="{r}" fill="none" stroke="{}" stroke-width="4"/>"#,
                wx - 3.0, wy - 3.0, ww + 6.0, wh + 6.0, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="{}" fill="{}"/>"#,
                wx, wy, ww, wh, r * 0.6, light
            ));
            let bw = ww * 0.78;
            let bh = 44.0_f32;
            let bx = (svg_w - bw) * 0.5;
            let by = qr_y + qr_size + 10.0;
            out.push_str(&format!(
                r#"<rect x="{:.3}" y="{:.3}" width="{:.3}" height="{:.3}" rx="22" fill="{}"/>"#,
                bx, by, bw, bh, opts.color
            ));
        }
        7 => {
            // Thick square border, no fill
            out.push_str(&format!(
                r#"<rect x="3" y="3" width="{:.3}" height="{:.3}" fill="none" stroke="{}" stroke-width="6"/>"#,
                svg_w - 6.0, svg_h - 6.0, opts.color
            ));
        }
        8 => {
            // Double square border
            out.push_str(&format!(
                r#"<rect x="2" y="2" width="{:.3}" height="{:.3}" fill="none" stroke="{}" stroke-width="3"/>"#,
                svg_w - 4.0, svg_h - 4.0, opts.color
            ));
            out.push_str(&format!(
                r#"<rect x="8" y="8" width="{:.3}" height="{:.3}" fill="none" stroke="{}" stroke-width="2"/>"#,
                svg_w - 16.0, svg_h - 16.0, opts.color
            ));
        }
        _ => {}
    }

    out
}

// ═══════════════════════════════════════════════════════════════════
//  FRAME — text label (rendered AFTER QR content so it's on top)
// ═══════════════════════════════════════════════════════════════════

fn render_frame_text(
    svg_w:   f32,
    svg_h:   f32,
    qr_y:    f32,
    qr_size: f32,
    opts:    &FrameOptions,
) -> String {
    if opts.style == 0 || opts.text.is_empty() {
        return String::new();
    }

    let (tx, ty) = match opts.style {
        3 | 4 => (svg_w * 0.5, svg_h - qr_y - qr_size * 0.5), // above: vertical centre of top area
        5 | 6 => {
            // Centre of the badge tab
            let ip  = 6.0_f32;
            let wh  = qr_size + ip * 2.0;
            let by  = qr_y - ip + wh + 10.0;
            let bh  = 44.0_f32;
            (svg_w * 0.5, by + bh * 0.5)
        }
        7 | 8 => return String::new(), // no text for border-only styles
        _ => (svg_w * 0.5, svg_h - 26.0), // below: near bottom
    };

    format!(
        r#"<text x="{tx:.3}" y="{ty:.3}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="15" font-weight="700" letter-spacing="1.5" fill="{col}">{text}</text>"#,
        tx = tx, ty = ty, col = opts.text_color, text = opts.text
    )
}

// ═══════════════════════════════════════════════════════════════════
//  MODULE SKIP PREDICATE
// ═══════════════════════════════════════════════════════════════════

/// Returns `true` if (row, col) falls inside one of the three finder
/// patterns (eyes). These modules are rendered separately with corner styles.
#[inline]
fn is_in_finder(row: usize, col: usize, qr_w: usize) -> bool {
    // top-left eye
    (row < 7 && col < 7)
    // top-right eye
    || (row < 7 && col + 7 >= qr_w)
    // bottom-left eye
    || (row + 7 >= qr_w && col < 7)
}

// ═══════════════════════════════════════════════════════════════════
//  MAIN SVG RENDERER
// ═══════════════════════════════════════════════════════════════════

pub fn generate(opts: &GenerateOptions) -> Result<String, QrError> {
    if opts.data.is_empty() { return Err(QrError::EmptyData); }
    validate_size(opts.size)?;
    validate_color(&opts.dark_color)?;
    validate_color(&opts.light_color)?;
    if let Some(g) = &opts.gradient {
        validate_color(&g.color1)?;
        validate_color(&g.color2)?;
    }
    if let Some(e) = &opts.eye_color {
        validate_color(&e.outer)?;
        validate_color(&e.inner)?;
    }

    let ec: EcLevel = opts.error_level.into();
    let code = QrCode::with_error_correction_level(opts.data.as_bytes(), ec)
        .map_err(|e| QrError::EncodingError(e.to_string()))?;

    let qr_w   = code.width();
    let colors = code.into_colors();

    let matrix: Vec<Vec<bool>> = colors
        .chunks(qr_w)
        .map(|row| row.iter().map(|c| *c == QrColor::Dark).collect())
        .collect();

    render_svg(&matrix, qr_w, opts)
}

fn render_svg(matrix: &[Vec<bool>], qr_w: usize, opts: &GenerateOptions) -> Result<String, QrError> {
    let quiet: usize = if opts.margin { 4 } else { 0 };
    let total = qr_w + 2 * quiet;

    // Module size in pixels
    let ms = opts.size as f32 / total as f32;

    // Total pixel size of the QR area (including quiet zone)
    let qr_px = ms * total as f32;

    // Frame geometry
    let geom = opts.frame.as_ref()
        .map(|f| frame_geom(f.style, !f.text.is_empty()))
        .unwrap_or(FrameGeom { pad_x: 0.0, pad_y_top: 0.0, pad_y_bot: 0.0 });

    let svg_w = qr_px + geom.pad_x * 2.0;
    let svg_h = qr_px + geom.pad_y_top + geom.pad_y_bot;

    // Top-left corner of the QR area (including quiet zone) in SVG space
    let qr_area_x = geom.pad_x;
    let qr_area_y = geom.pad_y_top;

    // Pixel origin of the first data module
    let mod_ox = qr_area_x + quiet as f32 * ms;
    let mod_oy = qr_area_y + quiet as f32 * ms;

    // QR area centre (for logo positioning)
    let qr_cx = qr_area_x + qr_px * 0.5;
    let qr_cy = qr_area_y + qr_px * 0.5;

    // Finder-eye top-left pixel corners
    let eye_tl = (mod_ox, mod_oy);
    let eye_tr = (mod_ox + (qr_w as f32 - 7.0) * ms, mod_oy);
    let eye_bl = (mod_ox, mod_oy + (qr_w as f32 - 7.0) * ms);

    // ── Fill references ──────────────────────────────────────────────────────
    let use_grad = opts.gradient.is_some();

    let data_fill: &str = if use_grad { "url(#midQrGrad)" } else { &opts.dark_color };

    let eye_outer: &str = if let Some(ref e) = opts.eye_color {
        &e.outer
    } else if use_grad {
        "url(#midQrGrad)"
    } else {
        &opts.dark_color
    };

    let eye_inner: &str = if let Some(ref e) = opts.eye_color {
        &e.inner
    } else if use_grad {
        "url(#midQrGrad)"
    } else {
        &opts.dark_color
    };

    // ── Assemble SVG ─────────────────────────────────────────────────────────
    let mut svg = String::with_capacity(qr_w * qr_w * 40 + 2048);

    // Root element
    svg.push_str(&format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="{w:.0}" height="{h:.0}" viewBox="0 0 {w:.3} {h:.3}">"#,
        w = svg_w.ceil(), h = svg_h.ceil()
    ));

    // Gradient defs
    if let Some(ref grad) = opts.gradient {
        let def = build_gradient_def("midQrGrad", grad, qr_px, qr_px, qr_area_x, qr_area_y);
        svg.push_str("<defs>");
        svg.push_str(&def);
        svg.push_str("</defs>");
    }

    // ① SVG background (light color fills everything first)
    svg.push_str(&format!(
        r#"<rect width="{:.3}" height="{:.3}" fill="{}"/>"#,
        svg_w, svg_h, opts.light_color
    ));

    // ② Frame background + inner white area (before QR so QR is on top)
    if let Some(ref frame) = opts.frame {
        svg.push_str(&render_frame_bg(
            svg_w, svg_h,
            qr_area_x, qr_area_y, qr_px,
            frame,
            &opts.light_color,
        ));
    }

    // ③ Data modules (single combined path)
    let mut data_path = String::with_capacity(qr_w * qr_w * 28);
    for row in 0..qr_w {
        for col in 0..qr_w {
            if is_in_finder(row, col, qr_w) { continue; }
            if !matrix[row][col]             { continue; }

            let x = mod_ox + col as f32 * ms;
            let y = mod_oy + row as f32 * ms;
            data_path.push_str(&module_path(x, y, ms, opts.module_style));
            data_path.push(' ');
        }
    }

    if !data_path.is_empty() {
        svg.push_str(&format!(
            r#"<path d="{}" fill="{}"/>"#,
            data_path.trim_end(), data_fill
        ));
    }

    // ④ Finder pattern eyes
    for (ox, oy) in [eye_tl, eye_tr, eye_bl] {
        svg.push_str(&render_finder(
            ox, oy, ms,
            opts.corner_square_style,
            opts.corner_dot_style,
            eye_outer,
            eye_inner,
        ));
    }

    // ⑤ Logo
    if let Some(ref logo) = opts.logo {
        svg.push_str(&build_logo_elements(logo, qr_cx, qr_cy, qr_px));
    }

    // ⑥ Frame text (on top of everything so it's always readable)
    if let Some(ref frame) = opts.frame {
        svg.push_str(&render_frame_text(
            svg_w, svg_h,
            qr_area_y, qr_px,
            frame,
        ));
    }

    svg.push_str("</svg>");
    Ok(svg)
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(data: &str) -> GenerateOptions {
        GenerateOptions { data: data.to_string(), ..Default::default() }
    }

    #[test]
    fn basic_svg_has_structure() {
        let svg = generate(&opts("https://example.com")).unwrap();
        assert!(svg.contains("<svg"),  "missing opening tag");
        assert!(svg.contains("</svg>"), "missing closing tag");
        assert!(svg.contains("<path"), "missing data path");
    }

    #[test]
    fn dot_style_generates() {
        let mut o = opts("test");
        o.module_style = ModuleStyle::Dot;
        let svg = generate(&o).unwrap();
        assert!(svg.contains("<svg"));
    }

    #[test]
    fn classy_style_generates() {
        let mut o = opts("test");
        o.module_style = ModuleStyle::Classy;
        generate(&o).unwrap();
    }

    #[test]
    fn gradient_adds_defs() {
        let mut o = opts("test");
        o.gradient = Some(GradientOptions {
            direction: GradientDirection::Diagonal,
            color1: "#ff0000".to_string(),
            color2: "#0000ff".to_string(),
        });
        let svg = generate(&o).unwrap();
        assert!(svg.contains("<defs>"));
        assert!(svg.contains("linearGradient"));
        assert!(svg.contains("url(#midQrGrad)"));
    }

    #[test]
    fn radial_gradient_generates() {
        let mut o = opts("test");
        o.gradient = Some(GradientOptions {
            direction: GradientDirection::Radial,
            color1: "#aa00ff".to_string(),
            color2: "#00aaff".to_string(),
        });
        let svg = generate(&o).unwrap();
        assert!(svg.contains("radialGradient"));
    }

    #[test]
    fn eye_color_options_apply() {
        let mut o = opts("test");
        o.eye_color = Some(EyeColorOptions {
            outer: "#ff0000".to_string(),
            inner: "#0000ff".to_string(),
        });
        let svg = generate(&o).unwrap();
        assert!(svg.contains("#ff0000"));
        assert!(svg.contains("#0000ff"));
    }

    #[test]
    fn corner_dot_style_dot() {
        let mut o = opts("test");
        o.corner_dot_style = CornerDotStyle::Dot;
        generate(&o).unwrap();
    }

    #[test]
    fn corner_square_extra_rounded() {
        let mut o = opts("test");
        o.corner_square_style = CornerSquareStyle::ExtraRounded;
        let svg = generate(&o).unwrap();
        assert!(svg.contains("evenodd"));
    }

    #[test]
    fn frame_style_1_generates() {
        let mut o = opts("test");
        o.frame = Some(FrameOptions {
            style: 1,
            color: "#1a1a2e".to_string(),
            text:  "Scan Me!".to_string(),
            text_color: "#ffffff".to_string(),
        });
        let svg = generate(&o).unwrap();
        assert!(svg.contains("Scan Me!"));
    }

    #[test]
    fn frame_style_5_badge() {
        let mut o = opts("test");
        o.frame = Some(FrameOptions {
            style: 5,
            color: "#e63946".to_string(),
            text:  "Scan".to_string(),
            text_color: "#ffffff".to_string(),
        });
        generate(&o).unwrap();
    }

    #[test]
    fn empty_data_errors() {
        assert!(matches!(generate(&opts("")), Err(QrError::EmptyData)));
    }

    #[test]
    fn invalid_size_errors() {
        let o = GenerateOptions { data: "x".into(), size: 50, ..Default::default() };
        assert!(matches!(generate(&o), Err(QrError::InvalidSize(_))));
    }

    #[test]
    fn finder_detection_version1() {
        let w = 21usize;
        // corners
        assert!(is_in_finder(0,  0,  w));
        assert!(is_in_finder(6,  6,  w));
        assert!(is_in_finder(0,  20, w));
        assert!(is_in_finder(6,  14, w));
        assert!(is_in_finder(20, 0,  w));
        assert!(is_in_finder(14, 6,  w));
        // data area should not be detected
        assert!(!is_in_finder(10, 10, w));
        assert!(!is_in_finder(8,  8,  w));
    }
    }
