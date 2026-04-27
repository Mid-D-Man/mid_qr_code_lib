//! wasm-bindgen bindings for mid-qr.
//!
//! ## JS API surface
//!
//! ### Generation
//! ```js
//! // Full options object
//! generate({ data, size?, darkColor?, lightColor?, errorLevel?,
//!            margin?, gradient?, logo? }) -> string (SVG)
//!
//! // Convenience wrapper
//! generateSimple(data, size, darkColor, lightColor) -> string (SVG)
//! ```
//!
//! ### Decode (still images — NOT for real-time camera frames)
//! ```js
//! // From canvas.getImageData().data  (Uint8ClampedArray / Uint8Array)
//! decodeRgba(data, width, height) -> string
//!
//! // From a pre-computed luma buffer (one byte per pixel)
//! decodeLuma(data, width, height) -> string
//!
//! // Utility — convert RGBA to luma using nimiq-compatible weights
//! // so callers can cache the grayscale buffer and try multiple regions
//! rgbaToLuma(data) -> Uint8Array
//! ```
//!
//! ### Info
//! ```js
//! getVersion()                    -> string
//! getSupportedErrorLevels()       -> string   // "L,M,Q,H"
//! getSupportedGradientDirections()-> string   // "linear-x,linear-y,diagonal,radial"
//! ```

use wasm_bindgen::prelude::*;
use serde::Deserialize;

#[cfg(feature = "generate")]
use mid_qr_core::generate::{
    generate as core_generate, ErrorLevel, GenerateOptions,
    GradientDirection, GradientOptions, LogoBorderOptions, LogoOptions,
};

#[cfg(feature = "decode")]
use mid_qr_core::decode::{decode_from_luma, decode_from_rgba, rgba_to_luma};

use mid_qr_core::QrError;

// ── Init ─────────────────────────────────────────────────────────────────────

#[wasm_bindgen(start)]
pub fn init() {
    // Only compiled in when the `debug` feature is enabled.
    // Allows panics to surface in the browser console during development.
    #[cfg(feature = "debug")]
    console_error_panic_hook::set_once();
}

// ── Error conversion ──────────────────────────────────────────────────────────

fn qr_err(e: QrError) -> JsValue {
    JsValue::from_str(&e.to_string())
}

fn deser_err(e: serde_wasm_bindgen::Error) -> JsValue {
    JsValue::from_str(&format!("Invalid options object: {e}"))
}

// ── JS-side option structs ────────────────────────────────────────────────────
//
// These are the shapes that JavaScript callers pass as plain objects.
// serde-wasm-bindgen deserialises them from JsValue without allocating
// intermediate JSON text.
//
// camelCase on the JS side, snake_case in Rust — serde handles the rename.

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsGradientOptions {
    /// "linear-x" | "linear-y" | "diagonal" | "radial"
    direction: Option<String>,
    color1: String,
    color2: String,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsLogoBorderOptions {
    color: String,
    /// Stroke width in SVG pixels.  Default: 2
    width: Option<u32>,
    /// Corner radius in SVG pixels.  Default: none
    radius: Option<u32>,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsLogoOptions {
    /// URL or data-URI of the logo image.
    url: String,
    /// Logo size as a fraction of the QR code's shorter side.
    /// Clamped to 0.10 – 0.35.  Default: 0.25
    size_ratio: Option<f32>,
    border: Option<JsLogoBorderOptions>,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsGenerateOptions {
    data: String,
    /// Output size in SVG pixels.  Default: 300
    size: Option<u32>,
    /// CSS color for dark modules.  Default: "#000000"
    dark_color: Option<String>,
    /// CSS color for light modules.  Default: "#FFFFFF"
    light_color: Option<String>,
    /// "L" | "M" | "Q" | "H"  Default: "M"
    /// Use "H" when embedding a logo.
    error_level: Option<String>,
    /// Include the quiet zone.  Default: true
    margin: Option<bool>,
    gradient: Option<JsGradientOptions>,
    logo: Option<JsLogoOptions>,
}

// ── Conversion: JS options → core options ────────────────────────────────────

#[cfg(feature = "generate")]
fn build_core_opts(js: JsGenerateOptions) -> GenerateOptions {
    let gradient = js.gradient.map(|g| GradientOptions {
        direction: GradientDirection::from_str(
            g.direction.as_deref().unwrap_or("linear-x"),
        ),
        color1: g.color1,
        color2: g.color2,
    });

    let logo = js.logo.map(|l| LogoOptions {
        url:        l.url,
        size_ratio: l.size_ratio.unwrap_or(0.25),
        border:     l.border.map(|b| LogoBorderOptions {
            color:  b.color,
            width:  b.width.unwrap_or(2),
            radius: b.radius,
        }),
    });

    GenerateOptions {
        data:        js.data,
        size:        js.size.unwrap_or(300),
        dark_color:  js.dark_color.unwrap_or_else(|| "#000000".to_string()),
        light_color: js.light_color.unwrap_or_else(|| "#FFFFFF".to_string()),
        error_level: js.error_level
            .as_deref()
            .map(ErrorLevel::from_str)
            .unwrap_or(ErrorLevel::M),
        margin:      js.margin.unwrap_or(true),
        gradient,
        logo,
    }
}

// ── Public API — Generation ───────────────────────────────────────────────────

/// Generate a QR code SVG from a full options object.
///
/// ```js
/// import init, { generate } from 'mid-qr';
/// await init();
///
/// // Plain QR code
/// const svg = generate({ data: "https://example.com" });
///
/// // With gradient
/// const svg = generate({
///   data:       "https://example.com",
///   size:       400,
///   errorLevel: "H",
///   gradient:   { direction: "diagonal", color1: "#FF0000", color2: "#0000FF" }
/// });
///
/// // With gradient + logo (always use errorLevel "H" with a logo)
/// const svg = generate({
///   data:       "https://example.com",
///   errorLevel: "H",
///   gradient:   { direction: "radial", color1: "#8B5CF6", color2: "#06B6D4" },
///   logo:       { url: "/logo.png", sizeRatio: 0.25,
///                 border: { color: "white", width: 3, radius: 4 } }
/// });
/// ```
#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate(options: JsValue) -> Result<String, JsValue> {
    let js_opts: JsGenerateOptions =
        serde_wasm_bindgen::from_value(options).map_err(deser_err)?;
    let core_opts = build_core_opts(js_opts);
    core_generate(&core_opts).map_err(qr_err)
}

/// Convenience wrapper — generate a plain QR code without an options object.
///
/// ```js
/// const svg = generateSimple("https://example.com", 300, "#000000", "#FFFFFF");
/// ```
#[cfg(feature = "generate")]
#[wasm_bindgen(js_name = "generateSimple")]
pub fn generate_simple(
    data:        &str,
    size:        u32,
    dark_color:  &str,
    light_color: &str,
) -> Result<String, JsValue> {
    let opts = GenerateOptions {
        data:        data.to_string(),
        size,
        dark_color:  dark_color.to_string(),
        light_color: light_color.to_string(),
        ..GenerateOptions::default()
    };
    core_generate(&opts).map_err(qr_err)
}

// ── Public API — Decode ───────────────────────────────────────────────────────

/// Decode a QR code from an RGBA byte buffer.
///
/// Intended for **still images** — file uploads, screenshots, canvas elements.
/// For real-time camera frames use the nimiq scanner worker instead
/// (see `MidQrScanner` in the JS wrapper).
///
/// ```js
/// // From a canvas
/// const ctx    = canvas.getContext("2d");
/// const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
/// const text   = decodeRgba(pixels.data, canvas.width, canvas.height);
///
/// // From an image file via createImageBitmap
/// const bmp    = await createImageBitmap(file);
/// const canvas = new OffscreenCanvas(bmp.width, bmp.height);
/// const ctx    = canvas.getContext("2d");
/// ctx.drawImage(bmp, 0, 0);
/// const pixels = ctx.getImageData(0, 0, bmp.width, bmp.height);
/// const text   = decodeRgba(pixels.data, bmp.width, bmp.height);
/// ```
#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "decodeRgba")]
pub fn decode_rgba_js(
    rgba:   &[u8],
    width:  u32,
    height: u32,
) -> Result<String, JsValue> {
    decode_from_rgba(rgba, width, height).map_err(qr_err)
}

/// Decode a QR code from a luma (grayscale) byte buffer.
///
/// One byte per pixel.  Use this if you already have a grayscale buffer
/// (e.g. a pre-computed frame from a custom pipeline) to avoid the RGBA→luma
/// conversion cost.
///
/// ```js
/// const luma = rgbaToLuma(pixels.data);
/// const text = decodeLuma(luma, canvas.width, canvas.height);
/// ```
#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "decodeLuma")]
pub fn decode_luma_js(
    luma:   &[u8],
    width:  u32,
    height: u32,
) -> Result<String, JsValue> {
    decode_from_luma(luma, width, height).map_err(qr_err)
}

/// Convert an RGBA buffer to a luma buffer using nimiq-compatible weights.
///
/// Weights: R×77 + G×150 + B×29 >> 8
/// These match nimiq's `{ red:77, green:150, blue:29, useIntegerApproximation:true }`.
///
/// Expose this so callers can compute luma once and reuse it across multiple
/// decode regions without paying the conversion cost repeatedly.
///
/// ```js
/// const luma = rgbaToLuma(imageData.data);
/// // try full frame
/// try { return decodeLuma(luma, w, h); } catch {}
/// // try centre crop
/// const cropped = cropLuma(luma, w, h, cx, cy, cw, ch);
/// return decodeLuma(cropped, cw, ch);
/// ```
#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "rgbaToLuma")]
pub fn rgba_to_luma_js(rgba: &[u8]) -> Vec<u8> {
    rgba_to_luma(rgba)
}

// ── Public API — Utility ──────────────────────────────────────────────────────

/// Library version string (matches Cargo.toml).
#[wasm_bindgen(js_name = "getVersion")]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

/// Comma-separated list of accepted error-correction level strings.
#[wasm_bindgen(js_name = "getSupportedErrorLevels")]
pub fn get_supported_error_levels() -> String {
    "L,M,Q,H".to_string()
}

/// Comma-separated list of accepted gradient direction strings.
#[wasm_bindgen(js_name = "getSupportedGradientDirections")]
pub fn get_supported_gradient_directions() -> String {
    "linear-x,linear-y,diagonal,radial".to_string()
}
