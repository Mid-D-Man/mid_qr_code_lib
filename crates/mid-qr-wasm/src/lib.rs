//! wasm-bindgen bindings for mid-qr.

use wasm_bindgen::prelude::*;
use serde::Deserialize;

#[cfg(feature = "generate")]
use mid_qr_core::generate::{
    generate as core_generate,
    ErrorLevel, GenerateOptions,
    GradientDirection, GradientOptions,
    LogoBorderOptions, LogoOptions,
    ModuleStyle, CornerSquareStyle, CornerDotStyle,
    EyeColorOptions, FrameOptions,
};

#[cfg(feature = "decode")]
use mid_qr_core::decode::{decode_from_luma, decode_from_rgba, rgba_to_luma};

use mid_qr_core::QrError;

// ── Init ──────────────────────────────────────────────────────────────────────

#[wasm_bindgen(start)]
pub fn init() {
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

// ── JS option structs ─────────────────────────────────────────────────────────

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsGradientOptions {
    direction: Option<String>,
    color1:    String,
    color2:    String,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsLogoBorderOptions {
    color:  String,
    width:  Option<u32>,
    radius: Option<u32>,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsLogoOptions {
    url:        String,
    size_ratio: Option<f32>,
    border:     Option<JsLogoBorderOptions>,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsEyeColorOptions {
    outer: String,
    inner: String,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsFrameOptions {
    style:      u32,
    color:      String,
    text:       Option<String>,
    text_color: Option<String>,
}

#[cfg(feature = "generate")]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsGenerateOptions {
    data:                String,
    size:                Option<u32>,
    dark_color:          Option<String>,
    light_color:         Option<String>,
    error_level:         Option<String>,
    margin:              Option<bool>,
    gradient:            Option<JsGradientOptions>,
    logo:                Option<JsLogoOptions>,
    // Style options
    module_style:        Option<String>,
    corner_square_style: Option<String>,
    corner_dot_style:    Option<String>,
    eye_color:           Option<JsEyeColorOptions>,
    frame:               Option<JsFrameOptions>,
}

// ── Options builder ───────────────────────────────────────────────────────────

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

    let eye_color = js.eye_color.map(|e| EyeColorOptions {
        outer: e.outer,
        inner: e.inner,
    });

    let frame = js.frame.map(|f| FrameOptions {
        style:      f.style,
        color:      f.color,
        text:       f.text.unwrap_or_else(|| "Scan Me!".to_string()),
        text_color: f.text_color.unwrap_or_else(|| "#ffffff".to_string()),
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
        margin:  js.margin.unwrap_or(true),
        gradient,
        logo,
        module_style: js.module_style
            .as_deref()
            .map(ModuleStyle::from_str)
            .unwrap_or_default(),
        corner_square_style: js.corner_square_style
            .as_deref()
            .map(CornerSquareStyle::from_str)
            .unwrap_or_default(),
        corner_dot_style: js.corner_dot_style
            .as_deref()
            .map(CornerDotStyle::from_str)
            .unwrap_or_default(),
        eye_color,
        frame,
    }
}

// ── Generation ────────────────────────────────────────────────────────────────

#[cfg(feature = "generate")]
#[wasm_bindgen]
pub fn generate(options: JsValue) -> Result<String, JsValue> {
    let js_opts: JsGenerateOptions =
        serde_wasm_bindgen::from_value(options).map_err(deser_err)?;
    let core_opts = build_core_opts(js_opts);
    core_generate(&core_opts).map_err(qr_err)
}

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

// ── Decode ────────────────────────────────────────────────────────────────────

#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "decodeRgba")]
pub fn decode_rgba_js(rgba: &[u8], width: u32, height: u32) -> Result<String, JsValue> {
    decode_from_rgba(rgba, width, height).map_err(qr_err)
}

#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "decodeLuma")]
pub fn decode_luma_js(luma: &[u8], width: u32, height: u32) -> Result<String, JsValue> {
    decode_from_luma(luma, width, height).map_err(qr_err)
}

#[cfg(feature = "decode")]
#[wasm_bindgen(js_name = "rgbaToLuma")]
pub fn rgba_to_luma_js(rgba: &[u8]) -> Vec<u8> {
    rgba_to_luma(rgba)
}

// ── Utility / capability queries ──────────────────────────────────────────────

#[wasm_bindgen(js_name = "getVersion")]
pub fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[wasm_bindgen(js_name = "getSupportedErrorLevels")]
pub fn get_supported_error_levels() -> String {
    "L,M,Q,H".to_string()
}

#[wasm_bindgen(js_name = "getSupportedGradientDirections")]
pub fn get_supported_gradient_directions() -> String {
    "linear-x,linear-y,diagonal,radial".to_string()
}

#[wasm_bindgen(js_name = "getSupportedModuleStyles")]
pub fn get_supported_module_styles() -> String {
    "square,dot,rounded,extra-rounded,classy,classy-rounded".to_string()
}

#[wasm_bindgen(js_name = "getSupportedCornerSquareStyles")]
pub fn get_supported_corner_square_styles() -> String {
    "square,extra-rounded,dot".to_string()
}

#[wasm_bindgen(js_name = "getSupportedCornerDotStyles")]
pub fn get_supported_corner_dot_styles() -> String {
    "square,dot".to_string()
}

#[wasm_bindgen(js_name = "getSupportedFrameStyles")]
pub fn get_supported_frame_styles() -> String {
    // style index : description
    "0:none,1:square-below,2:rounded-below,3:square-above,4:rounded-above,5:badge-square,6:badge-rounded,7:border-thick,8:border-double".to_string()
}
