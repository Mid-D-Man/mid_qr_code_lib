//! Static-image QR decode via rxing.
//!
//! ## API used
//!
//! rxing docs recommend QRCodeReader + immutable_decode for QR-only decoding.
//! MultiFormatReader panics on inputs that QRCodeReader handles as Err.
//!
//! ## Grayscale weights
//!
//! RGBA → luma uses R×77 + G×150 + B×29 >> 8, matching nimiq scanner weights.

use crate::error::QrError;

use rxing::{
    common::HybridBinarizer,
    qrcode::QRCodeReader,
    BinaryBitmap,
    Luma8LuminanceSource,
    Reader,
};

// ── Grayscale conversion ──────────────────────────────────────────────────────

/// Convert RGBA bytes to luma using nimiq-compatible weights.
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

fn decode_luma_inner(luma: Vec<u8>, width: u32, height: u32) -> Result<String, QrError> {
    // Use QRCodeReader (not MultiFormatReader) as recommended by rxing docs
    // for QR-only decoding with Luma8LuminanceSource.
    // immutable_decode is the stable API for 0.8+.
    let source    = Luma8LuminanceSource::new(luma, width, height);
    let binarizer = HybridBinarizer::new(source);
    let mut bitmap = BinaryBitmap::new(binarizer);

    QRCodeReader::default()
        .decode(&mut bitmap)
        .map(|r| r.getText().to_owned())
        .map_err(|e| QrError::DecodeError(format!("{e:?}")))
}

// ── Public API ────────────────────────────────────────────────────────────────

/// Decode a QR code from a luma buffer (one byte per pixel).
/// `luma.len()` must equal `width * height`.
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

/// Decode a QR code from an RGBA buffer (`canvas.getImageData().data`).
/// `rgba.len()` must equal `width * height * 4`.
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

    #[test] fn luma_red()   { assert_eq!(rgba_to_luma(&[255,0,0,255])[0], 76);  }
    #[test] fn luma_green() { assert_eq!(rgba_to_luma(&[0,255,0,255])[0], 149); }
    #[test] fn luma_blue()  { assert_eq!(rgba_to_luma(&[0,0,255,255])[0], 28);  }
    #[test] fn luma_white() { assert_eq!(rgba_to_luma(&[255,255,255,255])[0], 255); }
    #[test] fn luma_black() { assert_eq!(rgba_to_luma(&[0,0,0,255])[0], 0); }

    #[test]
    fn luma_pixel_count() {
        assert_eq!(rgba_to_luma(&[0u8; 400]).len(), 100);
    }

    #[test]
    fn luma_size_mismatch() {
        assert!(matches!(
            decode_from_luma(&[128u8; 99], 10, 10),
            Err(QrError::DecodeError(_))
        ));
    }

    #[test]
    fn rgba_size_mismatch() {
        assert!(matches!(
            decode_from_rgba(&[0u8; 10], 10, 10),
            Err(QrError::DecodeError(_))
        ));
    }

    #[test]
    fn blank_image_returns_error_not_panic() {
        // Must return Err, must not panic
        assert!(matches!(
            decode_from_luma(&vec![128u8; 100], 10, 10),
            Err(QrError::DecodeError(_))
        ));
    }
                }
