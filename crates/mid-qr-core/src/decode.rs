//! Static-image QR decode via rxing.
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

// ── Grayscale conversion ─────────────────────────────────────────────────────

/// Convert an RGBA byte slice to a luma (grayscale) byte vector using the
/// same integer-approximate weights as the nimiq QR scanner worker.
///
/// Weights: R×77 + G×150 + B×29, shifted right by 8 (÷256).
/// This matches nimiq's `{ red: 77, green: 150, blue: 29, useIntegerApproximation: true }`.
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

// ── Decode ───────────────────────────────────────────────────────────────────

/// Decode a QR code from a **luma** (grayscale) byte buffer.
///
/// `luma` must be exactly `width * height` bytes (one byte per pixel).
///
/// Returns the decoded text on success, or a [`QrError::DecodeError`] if no
/// QR code could be found or parsed.
pub fn decode_from_luma(luma: &[u8], width: u32, height: u32) -> Result<String, QrError> {
    if luma.len() != (width * height) as usize {
        return Err(QrError::DecodeError(format!(
            "Luma buffer length {} does not match {}×{} = {}",
            luma.len(), width, height, width * height
        )));
    }

    // rxing's BufferedImageLuminanceSource expects a Vec<u8>
    let source = BufferedImageLuminanceSource::new(luma.to_vec(), width as usize, height as usize);
    let mut bmp = BinaryBitmap::new(HybridBinarizer::new(Box::new(source)));

    let hints = DecodingHintDictionary::default();
    MultiFormatReader::default()
        .decode_with_hints(&mut bmp, &hints)
        .map(|result| result.getText().to_owned())
        .map_err(|e| QrError::DecodeError(format!("{e:?}")))
}

/// Decode a QR code from an **RGBA** byte buffer (e.g. from `canvas.getImageData`).
///
/// `rgba` must be exactly `width * height * 4` bytes.
///
/// Internally converts to luma using [`rgba_to_luma`], then calls
/// [`decode_from_luma`].
pub fn decode_from_rgba(rgba: &[u8], width: u32, height: u32) -> Result<String, QrError> {
    let expected = (width * height * 4) as usize;
    if rgba.len() != expected {
        return Err(QrError::DecodeError(format!(
            "RGBA buffer length {} does not match {}×{}×4 = {}",
            rgba.len(), width, height, expected
        )));
    }

    let luma = rgba_to_luma(rgba);
    decode_from_luma(&luma, width, height)
}

// ── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rgba_to_luma_weights_match_nimiq() {
        // Pure red pixel: R=255, G=0, B=0, A=255
        let luma = rgba_to_luma(&[255, 0, 0, 255]);
        // Expected: (255×77) >> 8 = 76
        assert_eq!(luma[0], 76);

        // Pure green pixel
        let luma = rgba_to_luma(&[0, 255, 0, 255]);
        // Expected: (255×150) >> 8 = 149
        assert_eq!(luma[0], 149);

        // Pure blue pixel
        let luma = rgba_to_luma(&[0, 0, 255, 255]);
        // Expected: (255×29) >> 8 = 28
        assert_eq!(luma[0], 28);
    }

    #[test]
    fn decode_returns_error_on_empty_image() {
        let result = decode_from_luma(&[128u8; 100], 10, 10);
        assert!(result.is_err());
    }

    #[test]
    fn rgba_buffer_size_mismatch_is_caught() {
        let result = decode_from_rgba(&[0u8; 10], 10, 10);
        assert!(matches!(result, Err(QrError::DecodeError(_))));
    }
}
