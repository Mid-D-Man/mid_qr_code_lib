//! Integration tests — encode a known string, then decode it.
//! These run with: cargo test

#[cfg(test)]
mod roundtrip {
    use mid_qr_core::generate::{generate, ErrorLevel, GenerateOptions};
    use mid_qr_core::decode::decode_from_rgba;

    #[test]
    fn generate_returns_svg() {
        let opts = GenerateOptions {
            data: "https://example.com".to_string(),
            ..Default::default()
        };
        let svg = generate(&opts).expect("generation failed");
        assert!(svg.contains("<svg"),  "missing opening SVG tag");
        assert!(svg.contains("</svg>"), "missing closing SVG tag");
    }

    // Full encode→render→decode roundtrip requires an image renderer
    // (not available in a no_std WASM test environment).
    // The decode path is covered by mid-qr-core unit tests.
}
