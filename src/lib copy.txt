use qrcode::QrCode;
use qrcode::render::svg;
use qrcode::EcLevel;
use wasm_bindgen::prelude::*;
// Custom Error type for better error handling
#[wasm_bindgen]
pub struct QrCodeError {
    message: String,
}

#[wasm_bindgen]
impl QrCodeError {
    #[wasm_bindgen(getter)]
    pub fn message(&self) -> String {
        self.message.clone()
    }
}

// Validate color format (simple version - accepts CSS color names and hex values)
fn validate_color(color: &str) -> bool {
    // Check if it's a hex color or color name (simplified validation)
    color.starts_with("#") || !color.contains("#")
}

#[wasm_bindgen]
pub fn generate_qr_code(data: &str, size: u32, dark_color: &str, light_color: &str) -> Result<String, JsValue> {
    if data.is_empty() {
        return Err(JsValue::from_str("QR code data cannot be empty"));
    }

    if size < 100 || size > 2000 {
        return Err(JsValue::from_str("Size must be between 100 and 2000 pixels"));
    }

    if !validate_color(dark_color) || !validate_color(light_color) {
        return Err(JsValue::from_str("Invalid color format"));
    }

    // Generate QR code with medium error correction by default
    match QrCode::with_error_correction_level(data, EcLevel::M) {
        Ok(code) => {
            let svg = code
                .render()
                .min_dimensions(size, size)
                .dark_color(svg::Color(dark_color))
                .light_color(svg::Color(light_color))
                .build();
            Ok(svg)
        },
        Err(e) => Err(JsValue::from_str(&format!("Failed to generate QR code: {}", e))),
    }
}

// Enhanced QR code generation with all options
#[wasm_bindgen]
pub fn generate_enhanced_qr_code(
    data: &str,
    size: u32,
    dark_color: &str,
    light_color: &str,
    error_level: Option<String>,
    logo_url: Option<String>,
    use_gradient: Option<bool>,
    gradient_direction: Option<String>,
    gradient_color1: Option<String>,
    gradient_color2: Option<String>,
    margin: Option<u32>
) -> Result<String, JsValue> {
    // Validate required parameters
    if data.is_empty() {
        return Err(JsValue::from_str("QR code data cannot be empty"));
    }

    if size < 100 || size > 2000 {
        return Err(JsValue::from_str("Size must be between 100 and 2000 pixels"));
    }

    if !validate_color(dark_color) || !validate_color(light_color) {
        return Err(JsValue::from_str("Invalid color format"));
    }

    // Set default values for optional parameters
    let ec_level = match error_level.as_deref() {
        Some("L") => EcLevel::L,
        Some("M") => EcLevel::M,
        Some("Q") => EcLevel::Q,
        Some("H") => EcLevel::H,
        _ => EcLevel::M, // Default to medium error correction
    };

    let quiet_zone = margin.unwrap_or(4);

    // Generate QR code with specified error correction level
    let code = match QrCode::with_error_correction_level(data, ec_level) {
        Ok(c) => c,
        Err(e) => return Err(JsValue::from_str(&format!("Failed to generate QR code: {}", e))),
    };

    // Generate base SVG
    let mut svg = code
        .render()
        .min_dimensions(size, size)
        .quiet_zone(quiet_zone > 0)
        .dark_color(svg::Color(dark_color))
        .light_color(svg::Color(light_color))
        .build();
    // If custom margin is requested and different from default (4)
    if quiet_zone > 0 && quiet_zone != 4 {
        // We need to modify the SVG to adjust the margin
        // This requires parsing the SVG and modifying the viewBox and dimensions
        // This is a simplified approach - might need refinement
        if let Some(viewbox_start) = svg.find("viewBox=\"") {
            let viewbox_end = svg[viewbox_start..].find("\"").unwrap_or(0) + viewbox_start;
            if viewbox_end > viewbox_start {
                // Parse the viewBox values
                let viewbox_str = &svg[viewbox_start + 8..viewbox_end];
                let values: Vec<&str> = viewbox_str.split_whitespace().collect();
                if values.len() == 4 {
                    // Adjust the viewBox based on the custom margin
                    // This is a simplified approach - you might need to fine-tune this
                    let margin_adjustment = (quiet_zone as f32 / 4.0) * size as f32;
                    let new_viewbox = format!("-{} -{} {} {}",
                                              margin_adjustment,
                                              margin_adjustment,
                                              size as f32 + 2.0 * margin_adjustment,
                                              size as f32 + 2.0 * margin_adjustment
                    );
                    svg = svg.replace(viewbox_str, &new_viewbox);
                }
            }
        }
    }
    // If gradient is requested, modify the SVG to add gradient definitions
    if use_gradient.unwrap_or(false) {
        let grad_color1 = gradient_color1.as_deref().unwrap_or(dark_color);
        let grad_color2 = gradient_color2.as_deref().unwrap_or(dark_color);

        if !validate_color(grad_color1) || !validate_color(grad_color2) {
            return Err(JsValue::from_str("Invalid gradient colors"));
        }

        let direction = gradient_direction.as_deref().unwrap_or("linear-x");

        let (x1, y1, x2, y2) = match direction {
            "linear-x" => ("0%", "0%", "100%", "0%"),
            "linear-y" => ("0%", "0%", "0%", "100%"),
            "diagonal" => ("0%", "0%", "100%", "100%"),
            "radial" => ("50%", "50%", "100%", "100%"),
            _ => ("0%", "0%", "100%", "0%"), // Default to horizontal
        };

        // Create gradient definition
        let gradient_def = if direction == "radial" {
            format!(
                "<defs><radialGradient id=\"qrGradient\" cx=\"{}\" cy=\"{}\" r=\"{}\" gradientUnits=\"userSpaceOnUse\">
                <stop offset=\"0%\" stop-color=\"{}\" />
                <stop offset=\"100%\" stop-color=\"{}\" />
                </radialGradient></defs>",
                x1, y1, x2, grad_color1, grad_color2
            )
        } else {
            format!(
                "<defs><linearGradient id=\"qrGradient\" x1=\"{}\" y1=\"{}\" x2=\"{}\" y2=\"{}\">
                <stop offset=\"0%\" stop-color=\"{}\" />
                <stop offset=\"100%\" stop-color=\"{}\" />
                </linearGradient></defs>",
                x1, y1, x2, y2, grad_color1, grad_color2
            )
        };

        // Replace all fill="dark_color" with fill="url(#qrGradient)"
        svg = svg.replace(&format!("fill=\"{}\"", dark_color), "fill=\"url(#qrGradient)\"");

        // Insert gradient definition after opening SVG tag
        let svg_tag_end = svg.find('>').unwrap_or(0) + 1;
        svg.insert_str(svg_tag_end, &gradient_def);
    }

    // If logo is requested, add it to the SVG
    if let Some(logo) = logo_url {
        // Calculate logo size and position (25% of QR code size)
        let logo_size = size / 4;
        let logo_x = (size - logo_size) / 2;
        let logo_y = (size - logo_size) / 2;

        // Create logo element with rounded corners
        let logo_element = format!(
            "<image href=\"{}\" x=\"{}\" y=\"{}\" height=\"{}\" width=\"{}\" preserveAspectRatio=\"xMidYMid slice\"/>
            <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" fill=\"none\" stroke=\"{}\" stroke-width=\"2\"/>",
            logo, logo_x, logo_y, logo_size, logo_size,
            logo_x, logo_y, logo_size, logo_size, light_color
        );

        // Insert logo element before closing tag
        let insert_pos = svg.rfind("</svg>").unwrap_or(svg.len());
        svg.insert_str(insert_pos, &logo_element);
    }

    Ok(svg)
}

// Function for getting supported error correction levels
#[wasm_bindgen]
pub fn get_supported_error_levels() -> String {
    String::from("L,M,Q,H")
}

// Function for getting supported gradient directions
#[wasm_bindgen]
pub fn get_supported_gradient_directions() -> String {
    String::from("linear-x,linear-y,diagonal,radial")
}