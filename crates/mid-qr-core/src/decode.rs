//! Static-image QR decode via rxing (pinned to 0.4.x).
//!
//! ## Scope
//!
//! This module is for **still images** — e.g. the user uploads a PNG or the
//! page renders a canvas from a file.  Real-time camera-frame decode stays in
//! the nimiq JS worker because its hand-tuned binarizer outperforms the
//! general-purpose HybridBinarizer on motion-blurred / unevenly-lit frames.
//!
//! ## Grayscale weights
//!
//! We use the same integer-approximation weights as the nimiq worker
//! (77 / 150 / 29 — sum = 256) so behaviour is consistent when the same
//! image passes through either path.

use crate::error::QrError;

use rxing::{
    common::HybridBinarizer,
    BinaryBitmap,
    BufferedImageLuminanceSource,
    DecodingHintDictionary,
    MultiFormatReader,
    Reader,
};

// ── Grayscale conversion ──────────────────────────────────────────────────────

/// Convert an RGBA byte slice to a luma (grayscale) byte vector using the
/// same integer-approximate weights as the nimiq QR scanner worker.
///
/// Weights: R×77 + G×150 + B×29, shifted right by 8 (÷256).
/// These match nimiq's `{ red: 77, green: 150, blue: 29, useIntegerApproximation: true }`.
pub fn rgba_to_luma(rgba: &[u8]) -> Vec<u8> {
    rgba.chunks_exact(4)
        .map(|p| {
            let r = p[0] as u32;
            let g = p[1] as u32;
            let b = p[2] as u32;
            ((r * 77 + g * 150 + b * 29) >> 8) as u8
        })
        .collect()
}

// ── Internal decode ───────────────────────────────────────────────────────────

/// Core decode — takes an already-validated luma buffer.
/// Separated so both public functions share the same error-handling path.
fn decode_luma_inner(luma: Vec<u8>, width: u32, height: u32) -> Result<String, QrError> {
    // rxing 0.4: BufferedImageLuminanceSource::new(data: Vec<u8>, width: usize, height: usize)
    let source = BufferedImageLuminanceSource::new(
        luma,
        width  as usize,
        height as usize,
    );

    let mut bmp   = BinaryBitmap::new(HybridBinarizer::new(Box::new(source)));
    let     hints = DecodingHintDictionary::default();

    MultiFormatReader::default()
        .decode_with_hints(&mut bmp, &hints)
        .map(|result| result.getText().to_owned())
        .map_err(|e| QrError::DecodeError(format!("{e:?}")))
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Decode a QR code from a **luma** (grayscale) byte buffer.
///
/// `luma` must be exactly `width * height` bytes (one byte per pixel).
///
/// Returns the decoded text on success, or [`QrError::DecodeError`] if no
/// QR code could be found or parsed.
pub fn decode_from_luma(luma: &[u8], width: u32, height: u32) -> Result<String, QrError> {
    let expected = (width * height) as usize;
    if luma.len() != expected {
        return Err(QrError::DecodeError(format!(
            "Luma buffer length {} does not match {}×{} = {}",
            luma.len(), width, height, expected
        )));
    }
    decode_luma_inner(luma.to_vec(), width, height)
}

/// Decode a QR code from an **RGBA** byte buffer
/// (e.g. from `canvas.getImageData().data`).
///
/// `rgba` must be exactly `width * height * 4` bytes.
///
/// Internally converts to luma using [`rgba_to_luma`], then decodes.
pub fn decode_from_rgba(rgba: &[u8], width: u32, height: u32) -> Result<String, QrError> {
    let expected = (width * height * 4) as usize;
    if rgba.len() != expected {
        return Err(QrError::DecodeError(format!(
            "RGBA buffer length {} does not match {}×{}×4 = {}",
            rgba.len(), width, height, expected
        )));
    }
    let luma = rgba_to_luma(rgba);
    decode_luma_inner(luma, width, height)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── rgba_to_luma weight validation ────────────────────────────────────────
    // These constants must match the nimiq worker's grayscale weights exactly:
    //   { red: 77, green: 150, blue: 29, useIntegerApproximation: true }

    #[test]
    fn luma_weights_red() {
        // R=255, G=0, B=0 → (255×77) >> 8 = 76
        let out = rgba_to_luma(&[255, 0, 0, 255]);
        assert_eq!(out[0], 76, "red weight mismatch");
    }

    #[test]
    fn luma_weights_green() {
        // R=0, G=255, B=0 → (255×150) >> 8 = 149
        let out = rgba_to_luma(&[0, 255, 0, 255]);
        assert_eq!(out[0], 149, "green weight mismatch");
    }

    #[test]
    fn luma_weights_blue() {
        // R=0, G=0, B=255 → (255×29) >> 8 = 28
        let out = rgba_to_luma(&[0, 0, 255, 255]);
        assert_eq!(out[0], 28, "blue weight mismatch");
    }

    #[test]
    fn luma_weights_white() {
        // R=255, G=255, B=255 → (255×77 + 255×150 + 255×29) >> 8 = (255×256) >> 8 = 255
        let out = rgba_to_luma(&[255, 255, 255, 255]);
        assert_eq!(out[0], 255, "white should be luma 255");
    }

    #[test]
    fn luma_weights_black() {
        let out = rgba_to_luma(&[0, 0, 0, 255]);
        assert_eq!(out[0], 0, "black should be luma 0");
    }

    // ── Buffer size guards ────────────────────────────────────────────────────

    #[test]
    fn luma_size_mismatch_is_caught() {
        let result = decode_from_luma(&[128u8; 99], 10, 10);
        assert!(
            matches!(result, Err(QrError::DecodeError(_))),
            "expected DecodeError for mismatched luma buffer"
        );
    }

    #[test]
    fn rgba_size_mismatch_is_caught() {
        // 10×10 RGBA requires 400 bytes; supply 10
        let result = decode_from_rgba(&[0u8; 10], 10, 10);
        assert!(
            matches!(result, Err(QrError::DecodeError(_))),
            "expected DecodeError for mismatched RGBA buffer"
        );
    }

    #[test]
    fn empty_image_returns_decode_error() {
        // 10×10 blank grey image — no QR code present
        let luma = vec![128u8; 100];
        let result = decode_from_luma(&luma, 10, 10);
        assert!(
            matches!(result, Err(QrError::DecodeError(_))),
            "blank image should return DecodeError"
        );
    }

    #[test]
    fn rgba_conversion_pixel_count() {
        // rgba_to_luma must produce exactly one output byte per RGBA pixel
        let rgba = vec![0u8; 4 * 100]; // 100 pixels
        let luma = rgba_to_luma(&rgba);
        assert_eq!(luma.len(), 100, "luma length should equal pixel count");
    }
}
