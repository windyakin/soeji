use bytes::Bytes;
use image::{DynamicImage, ImageOutputFormat, imageops::FilterType};
use std::io::Cursor;

use crate::error::ConverterError;

#[derive(Debug, Clone, Copy, Default)]
pub enum OutputFormat {
    Png,
    #[default]
    WebP,
}

#[derive(Debug, Clone, Copy, Default)]
pub enum FitMode {
    #[default]
    Cover,
    Contain,
    Fill,
}

impl FitMode {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "cover" => Some(FitMode::Cover),
            "contain" => Some(FitMode::Contain),
            "fill" => Some(FitMode::Fill),
            _ => None,
        }
    }
}

pub struct ConversionRequest {
    pub data: Bytes,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub output_format: OutputFormat,
    pub quality: u8,
    pub fit_mode: FitMode,
}

pub struct ConversionResult {
    pub data: Bytes,
    pub content_type: &'static str,
    pub original_width: u32,
    pub original_height: u32,
    pub output_width: u32,
    pub output_height: u32,
}

pub fn convert(request: ConversionRequest) -> Result<ConversionResult, ConverterError> {
    // Load image from bytes
    let img = image::load_from_memory(&request.data)?;
    let original_width = img.width();
    let original_height = img.height();

    // Resize if dimensions are specified
    let resized = resize_image(&img, request.width, request.height, request.fit_mode);
    let output_width = resized.width();
    let output_height = resized.height();

    // Encode to output format
    let (data, content_type) = encode_image(&resized, request.output_format, request.quality)?;

    Ok(ConversionResult {
        data,
        content_type,
        original_width,
        original_height,
        output_width,
        output_height,
    })
}

fn resize_image(
    img: &DynamicImage,
    width: Option<u32>,
    height: Option<u32>,
    fit_mode: FitMode,
) -> DynamicImage {
    match (width, height) {
        (Some(w), Some(h)) => {
            match fit_mode {
                FitMode::Cover => img.resize_to_fill(w, h, FilterType::Lanczos3),
                FitMode::Contain => img.resize(w, h, FilterType::Lanczos3),
                FitMode::Fill => img.resize_exact(w, h, FilterType::Lanczos3),
            }
        }
        (Some(w), None) => {
            // Maintain aspect ratio based on width
            let ratio = w as f64 / img.width() as f64;
            let new_height = (img.height() as f64 * ratio) as u32;
            img.resize_exact(w, new_height, FilterType::Lanczos3)
        }
        (None, Some(h)) => {
            // Maintain aspect ratio based on height
            let ratio = h as f64 / img.height() as f64;
            let new_width = (img.width() as f64 * ratio) as u32;
            img.resize_exact(new_width, h, FilterType::Lanczos3)
        }
        (None, None) => img.clone(),
    }
}

fn encode_image(
    img: &DynamicImage,
    format: OutputFormat,
    quality: u8,
) -> Result<(Bytes, &'static str), ConverterError> {
    match format {
        OutputFormat::Png => {
            let mut buffer = Vec::new();
            img.write_to(&mut Cursor::new(&mut buffer), ImageOutputFormat::Png)?;
            Ok((Bytes::from(buffer), "image/png"))
        }
        OutputFormat::WebP => {
            let rgba = img.to_rgba8();
            let encoder = webp::Encoder::from_rgba(&rgba, img.width(), img.height());
            let webp_data = encoder.encode(quality as f32);
            Ok((Bytes::from(webp_data.to_vec()), "image/webp"))
        }
    }
}
