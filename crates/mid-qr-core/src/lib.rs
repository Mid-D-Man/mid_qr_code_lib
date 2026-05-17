//! mid-qr-core — pure Rust QR generation + static-image decode
//!
//! Feature flags
//! ─────────────
//! `generate` (default) – SVG QR generation via the `qrcode` crate
//! `decode`   (default) – static-image QR decode via `rxing`

pub mod error;

#[cfg(feature = "generate")]
pub mod generate;

#[cfg(feature = "decode")]
pub mod decode;

// ── Re-exports ────────────────────────────────────────────────────────────────

pub use error::QrError;

#[cfg(feature = "generate")]
pub use generate::{
    // core fn
    generate,
    // options struct
    GenerateOptions,
    // enums — error level
    ErrorLevel,
    // enums — gradient
    GradientDirection,
    // enums — module / corner styles (NEW)
    ModuleStyle,
    CornerSquareStyle,
    CornerDotStyle,
    // option structs — gradient / logo
    GradientOptions,
    LogoBorderOptions,
    LogoOptions,
    // option structs — new
    EyeColorOptions,
    FrameOptions,
};

#[cfg(feature = "decode")]
pub use decode::{decode_from_luma, decode_from_rgba};
