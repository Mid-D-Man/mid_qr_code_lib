//! mid-qr-core — pure Rust QR generation + static-image decode
//!
//! Feature flags
//! ─────────────
//! `generate` (default) – SVG QR generation via the `qrcode` crate
//! `decode`   (default) – static-image QR decode via `rxing`
//!
//! Real-time camera decode is intentionally left to the nimiq JS worker
//! because its binarizer is tuned specifically for camera-frame conditions.
//! This crate handles the decode of still images (e.g. user file uploads).

pub mod error;

#[cfg(feature = "generate")]
pub mod generate;

#[cfg(feature = "decode")]
pub mod decode;

// ── Re-exports ───────────────────────────────────────────────────────────────

pub use error::QrError;

#[cfg(feature = "generate")]
pub use generate::{
    generate, ErrorLevel, GenerateOptions, GradientDirection, GradientOptions,
    LogoBorderOptions, LogoOptions,
};

#[cfg(feature = "decode")]
pub use decode::{decode_from_luma, decode_from_rgba};
