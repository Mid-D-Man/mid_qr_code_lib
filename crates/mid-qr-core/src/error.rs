//! Unified error type for mid-qr-core.

use std::fmt;

#[derive(Debug)]
pub enum QrError {
    /// The data string passed to the encoder was empty.
    EmptyData,

    /// `size` is outside the acceptable range (100 – 4 096 px).
    InvalidSize(u32),

    /// A color string failed validation.
    InvalidColor(String),

    /// The `qrcode` crate could not encode the data
    /// (e.g. data too long for chosen error-correction level).
    EncodingError(String),

    /// `rxing` could not find or decode a QR code in the provided image.
    DecodeError(String),

    /// Something went wrong while manipulating the generated SVG string.
    SvgError(String),
}

impl fmt::Display for QrError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            QrError::EmptyData => write!(f, "QR code data cannot be empty"),
            QrError::InvalidSize(s) => {
                write!(f, "Size {s} is invalid; must be between 100 and 4096 pixels")
            }
            QrError::InvalidColor(c) => write!(f, "Invalid color value: '{c}'"),
            QrError::EncodingError(e) => write!(f, "QR encoding failed: {e}"),
            QrError::DecodeError(e) => write!(f, "QR decode failed: {e}"),
            QrError::SvgError(e) => write!(f, "SVG manipulation error: {e}"),
        }
    }
}

impl std::error::Error for QrError {}
