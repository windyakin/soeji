use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
};
use serde::Deserialize;

use crate::error::ConverterError;
use crate::services::converter::{convert, ConversionRequest, FitMode, OutputFormat};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct ImageQuery {
    pub w: Option<u32>,
    pub h: Option<u32>,
    pub q: Option<u8>,
    pub fit: Option<String>,
}

/// パスからバケット名とキーを抽出
/// 例: "soeji-images/abc123.png" -> ("soeji-images", "abc123.png")
fn parse_path(path: &str) -> Result<(&str, &str), ConverterError> {
    let path = path.trim_start_matches('/');

    if let Some(pos) = path.find('/') {
        let bucket = &path[..pos];
        let key = &path[pos + 1..];

        if bucket.is_empty() {
            return Err(ConverterError::InvalidParameter("bucket name is empty".to_string()));
        }
        if key.is_empty() {
            return Err(ConverterError::InvalidParameter("object key is empty".to_string()));
        }

        Ok((bucket, key))
    } else {
        Err(ConverterError::InvalidParameter(
            "path must be in format: /{bucket}/{key}".to_string()
        ))
    }
}

pub async fn get_image(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Query(params): Query<ImageQuery>,
    headers: HeaderMap,
) -> Result<Response, ConverterError> {
    // パスからバケット名とキーを抽出
    let (bucket, key) = parse_path(&path)?;

    // Validate dimensions
    if let Some(w) = params.w {
        if w > state.config.max_dimension {
            return Err(ConverterError::DimensionTooLarge(w, state.config.max_dimension));
        }
        if w == 0 {
            return Err(ConverterError::InvalidParameter("width must be greater than 0".to_string()));
        }
    }
    if let Some(h) = params.h {
        if h > state.config.max_dimension {
            return Err(ConverterError::DimensionTooLarge(h, state.config.max_dimension));
        }
        if h == 0 {
            return Err(ConverterError::InvalidParameter("height must be greater than 0".to_string()));
        }
    }

    // Validate quality
    let quality = params.q.unwrap_or(state.config.webp_default_quality);
    if quality == 0 || quality > 100 {
        return Err(ConverterError::InvalidParameter("quality must be between 1 and 100".to_string()));
    }

    // Parse fit mode
    let fit_mode = params
        .fit
        .as_ref()
        .and_then(|f| FitMode::from_str(f))
        .unwrap_or_default();

    // Determine output format from Accept header
    let output_format = determine_format(&headers);

    // Fetch image from S3
    tracing::debug!("Fetching image from S3: bucket={}, key={}", bucket, key);
    let data = state.s3_client.get_object(bucket, key).await?;

    // Convert image
    tracing::debug!(
        "Converting image: w={:?}, h={:?}, q={}, format={:?}",
        params.w,
        params.h,
        quality,
        output_format
    );

    let result = convert(ConversionRequest {
        data,
        width: params.w,
        height: params.h,
        output_format,
        quality,
        fit_mode,
    })?;

    tracing::debug!(
        "Conversion complete: {}x{} -> {}x{}",
        result.original_width,
        result.original_height,
        result.output_width,
        result.output_height
    );

    // Build response with headers
    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, result.content_type),
            (header::CACHE_CONTROL, "public, max-age=31536000, immutable"),
            (header::VARY, "Accept"),
        ],
        result.data,
    )
        .into_response())
}

fn determine_format(headers: &HeaderMap) -> OutputFormat {
    let accept = headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    if accept.contains("image/webp") {
        OutputFormat::WebP
    } else {
        OutputFormat::Png
    }
}
