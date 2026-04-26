use qr_code_generator::{generate_qr_code, generate_enhanced_qr_code};
use std::fs;
use std::path::Path;

fn main() {
    // Create test directory if it doesn't exist
    let output_dir = Path::new("sample_qr_codes");
    if !output_dir.exists() {
        fs::create_dir(output_dir).expect("Failed to create sample output directory");
    }

    // Test standard QR code
    let standard_qr = generate_qr_code("https://example.com", 300, "#000000", "#FFFFFF")
        .expect("Failed to generate standard QR code");
    fs::write(output_dir.join("standard_qr.svg"), standard_qr).expect("Failed to write standard QR");
    println!("Standard QR code generated successfully");

    // Test QR code with gradient (horizontal)
    let gradient_qr = generate_enhanced_qr_code(
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
    ).expect("Failed to generate gradient QR code");
    fs::write(output_dir.join("gradient_qr.svg"), gradient_qr).expect("Failed to write gradient QR");
    println!("Gradient QR code generated successfully");

    // Test QR code with logo
    let logo_qr = generate_enhanced_qr_code(
        "https://example.com",
        300,
        "#000000",
        "#FFFFFF",
        Some("H".to_string()),
        Some("https://placeholder.com/logo.png".to_string()),
        None,
        None,
        None,
        None,
        Some(4)
    ).expect("Failed to generate logo QR code");
    fs::write(output_dir.join("logo_qr.svg"), logo_qr).expect("Failed to write logo QR");
    println!("Logo QR code generated successfully");

    // Test QR code with both gradient and logo
    let combined_qr = generate_enhanced_qr_code(
        "https://example.com",
        300,
        "#000000",
        "#FFFFFF",
        Some("H".to_string()),
        Some("https://placeholder.com/logo.png".to_string()),
        Some(true),
        Some("diagonal".to_string()),
        Some("#FF0000".to_string()),
        Some("#0000FF".to_string()),
        Some(4)
    ).expect("Failed to generate combined QR code");
    fs::write(output_dir.join("combined_qr.svg"), combined_qr).expect("Failed to write combined QR");
    println!("Combined QR code generated successfully");

    println!("All QR codes generated successfully. Check the sample_qr_codes directory.");
}