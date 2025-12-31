use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ConverterError {
    #[error("Image not found: {0}")]
    NotFound(String),

    #[error("S3 error: {0}")]
    S3Error(String),

    #[error("Image processing error: {0}")]
    ImageError(#[from] image::ImageError),

    #[error("WebP encoding error: {0}")]
    WebPError(String),

    #[error("Invalid parameter: {0}")]
    InvalidParameter(String),

    #[error("Dimension too large: {0} exceeds maximum {1}")]
    DimensionTooLarge(u32, u32),

    #[error("Internal error: {0}")]
    Internal(String),
}

impl IntoResponse for ConverterError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            ConverterError::NotFound(_) => (StatusCode::NOT_FOUND, self.to_string()),
            ConverterError::InvalidParameter(_) => (StatusCode::BAD_REQUEST, self.to_string()),
            ConverterError::DimensionTooLarge(_, _) => (StatusCode::BAD_REQUEST, self.to_string()),
            ConverterError::S3Error(msg) => {
                tracing::error!("S3 error: {}", msg);
                (StatusCode::BAD_GATEWAY, "Failed to fetch image from storage".to_string())
            }
            ConverterError::ImageError(e) => {
                tracing::error!("Image processing error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Failed to process image".to_string())
            }
            ConverterError::WebPError(msg) => {
                tracing::error!("WebP encoding error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Failed to encode image".to_string())
            }
            ConverterError::Internal(msg) => {
                tracing::error!("Internal error: {}", msg);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        (status, message).into_response()
    }
}
