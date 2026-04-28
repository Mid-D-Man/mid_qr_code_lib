//! Static-image QR decode via rxing.
//!
//! ## Why Luma8LuminanceSource, not BufferedImageLuminanceSource
//!
//! `BufferedImageLuminanceSource` lives behind rxing's `image` feature flag.
//! That feature pulls in the `image` crate which uses `std::fs` and native OS
//! image decoders — none of which exist in `wasm32-unknown-unknown`.
//! We therefore build rxing with `default-features = false` (no image crate)
//! and use `Luma8LuminanceSource`, which is the officially documented
//! WASM-compatible luminance source.
//!
//! ## Grayscale weights
//!
//! We convert RGBA → luma using the same integer-approximation weights as the
//! nimiq scanner worker (R×77 + G×150 + B×29 >> 8) so behaviour is consistent
//! when the same image passes through either decode path.
//!
//! ## Camera frames
//!
//! Real-time camera decode stays in the nimiq JS worker. Its binarizer is
//! hand-tuned for camera-frame conditions (motion blur, uneven lighting).
//! This module handles still images only (file uploads, canvas captures).

use crate::error::QrError;

use rxing::{
    common::HybridBinarizer,
    BinaryBitmap,
    Luma8LuminanceSource,
    MultiFormatReader,
    Reader,
};

// ── Grayscale conversion ──────────────────────────────────────────────────────

/// Convert an RGBA byte slice to a luma (grayscale) byte vector.
///
/// Uses integer-approximate weights matching the nimiq scanner worker:
/// `{ red: 77, green: 150, blue: 29, useIntegerApproximation: true }`
///
/// Formula per pixel: `(R×77 + G×150 + B×29) >> 8`
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

/// Core decode path — takes an already-validated, already-converted luma buffer.
fn decode_luma_inner(luma: Vec<u8>, width: u32, height: u32) -> Result<String, QrError> {
    // Luma8LuminanceSource::new(data: Vec<u8>, width: u32, height: u32)
    // This is the documented WASM-safe luminance source in rxing.
    let source   = Luma8LuminanceSource::new(luma, width, height);
    // HybridBinarizer takes the source directly (no Box wrapping needed in 0.8)
    let binarizer = HybridBinarizer::new(source);
    let mut bitmap = BinaryBitmap::new(binarizer);

    // MultiFormatReader with no hints — detects QR codes and all other
    // supported formats. For a QR-only binary (smaller WASM) you can swap
    // this for rxing::qrcode::QRCodeReader::default().
    MultiFormatReader::default()
        .decode(&mut bitmap)
        .map(|result| result.getText().to_owned())
        .map_err(|e| QrError::DecodeError(format!("{e:?}")))
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Decode a QR code from a **luma** (grayscale, one byte per pixel) buffer.
///
/// `luma.len()` must equal `width * height`.
///
/// # Errors
/// Returns [`QrError::DecodeError`] if the buffer size is wrong or no QR
/// code can be found/parsed in the image.
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
/// `rgba.len()` must equal `width * height * 4`.
///
/// Internally converts to luma using [`rgba_to_luma`] then calls
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
    decode_luma_inner(luma, width, height)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    // ── Grayscale weight correctness ──────────────────────────────────────────
    // Values must match nimiq's integer weights exactly.

    #[test]
    fn luma_red() {
        // (255×77) >> 8 = 76
        assert_eq!(rgba_to_luma(&[255, 0, 0, 255])[0], 76);
    }

    #[test]
    fn luma_green() {
        // (255×150) >> 8 = 149
        assert_eq!(rgba_to_luma(&[0, 255, 0, 255])[0], 149);
    }

    #[test]
    fn luma_blue() {
        // (255×29) >> 8 = 28
        assert_eq!(rgba_to_luma(&[0, 0, 255, 255])[0], 28);
    }

    #[test]
    fn luma_white() {
        // (255×(77+150+29)) >> 8 = (255×256) >> 8 = 255
        assert_eq!(rgba_to_luma(&[255, 255, 255, 255])[0], 255);
    }

    #[test]
    fn luma_black() {
        assert_eq!(rgba_to_luma(&[0, 0, 0, 255])[0], 0);
    }

    #[test]
    fn luma_pixel_count_matches() {
        // Output length must equal pixel count, not byte count
        let luma = rgba_to_luma(&[0u8; 400]); // 100 RGBA pixels
        assert_eq!(luma.len(), 100);
    }

    // ── Buffer size guards ────────────────────────────────────────────────────

    #[test]
    fn luma_size_mismatch_caught() {
        let r = decode_from_luma(&[128u8; 99], 10, 10);
        assert!(matches!(r, Err(QrError::DecodeError(_))));
    }

    #[test]
    fn rgba_size_mismatch_caught() {
        let r = decode_from_rgba(&[0u8; 10], 10, 10);
        assert!(matches!(r, Err(QrError::DecodeError(_))));
    }

    #[test]
    fn blank_image_returns_decode_error() {
        // A plain grey image has no QR code — must return an error, not panic
        let luma = vec![128u8; 100]; // 10×10 grey
        let r    = decode_from_luma(&luma, 10, 10);
        assert!(matches!(r, Err(QrError::DecodeError(_))));
    }
}
