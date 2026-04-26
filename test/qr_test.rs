use qr_code_generator::{generate_qr_code, generate_enhanced_qr_code};
use std::fs;
use std::path::Path;

fn main() {
    // Create test directory if it doesn't exist
    let output_dir = Path::new("test_output");
    if !output_dir.exists() {
        fs::create_dir(output_dir).expect("Failed to create test output directory");
    }

    // Test standard QR code
    let standard_qr = match generate_qr_code("https://example.com", 300, "#000000", "#FFFFFF") {
        Ok(svg) => svg,
        Err(e) => panic!("Failed to generate standard QR code: {:?}", e),
    };
    fs::write(output_dir.join("standard_qr.svg"), standard_qr).expect("Failed to write standard QR");
    println!("Standard QR code generated successfully");

    // Test QR code with gradient (horizontal)
    let gradient_qr = match generate_enhanced_qr_code(
        "https://example.com",
        300,
        "#000000",
        "#FFFFFF",
        Some("H".to_string()),
        None,
        Some(true),
        Some("linear-x".to_string()),
        Some("#FF0000".to_string()),
        Some("#0000FF".to_string()),
        Some(4)
    ) {
        Ok(svg) => svg,
        Err(e) => panic!("Failed to generate gradient QR code: {:?}", e),
    };
    fs::write(output_dir.join("gradient_qr.svg"), gradient_qr).expect("Failed to write gradient QR");
    println!("Gradient QR code generated successfully");

    // Test QR code with logo
    let logo_qr = match generate_enhanced_qr_code(
        "https://example.com",
        300,
        "#000000",
        "#FFFFFF",
        Some("H".to_string()),
        Some("https://example.com/logo.png".to_string()),
        None,
        None,
        None,
        None,
        Some(4)
    ) {
        Ok(svg) => svg,
        Err(e) => panic!("Failed to generate logo QR code: {:?}", e),
    };
    fs::write(output_dir.join("logo_qr.svg"), logo_qr).expect("Failed to write logo QR");
    println!("Logo QR code generated successfully");

    // Test QR code with both gradient and logo
    let combined_qr = match generate_enhanced_qr_code(
        "https://example.com",
        300,
        "#000000",
        "#FFFFFF",
        Some("H".to_string()),
        Some("https://example.com/logo.png".to_string()),
        Some(true),
        Some("diagonal".to_string()),
        Some("#FF0000".to_string()),
        Some("#0000FF".to_string()),
        Some(4)
    ) {
        Ok(svg) => svg,
        Err(e) => panic!("Failed to generate combined QR code: {:?}", e),
    };
    fs::write(output_dir.join("combined_qr.svg"), combined_qr).expect("Failed to write combined QR");
    println!("Combined QR code generated successfully");

    println!("All QR codes generated successfully. Check the test_output directory.");
}
#[cfg(test)]
mod tests {
    use qr_code_generator::{generate_qr_code, generate_enhanced_qr_code};

    #[test]
    fn test_standard_qr_code() {
        let result = generate_qr_code("test", 200, "#000000", "#FFFFFF");
        assert!(result.is_ok());
        let svg = result.unwrap();
        assert!(svg.contains("<svg"));
        assert!(svg.contains("</svg>"));
    }

    #[test]
    fn test_gradient_qr_code() {
        let result = generate_enhanced_qr_code(
            "test",
            200,
            "#000000",
            "#FFFFFF",
            Some("H".to_string()),
            None,
            Some(true),
            Some("linear-x".to_string()),
            Some("#FF0000".to_string()),
            Some("#0000FF".to_string()),
            Some(4)
        );
        assert!(result.is_ok());
        let svg = result.unwrap();
        assert!(svg.contains("<linearGradient"));
        assert!(svg.contains("</linearGradient>"));
    }
}