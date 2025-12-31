use std::env;

#[derive(Clone)]
pub struct Config {
    pub port: u16,
    pub s3_endpoint: String,
    pub s3_access_key: String,
    pub s3_secret_key: String,
    pub s3_region: String,
    pub webp_default_quality: u8,
    pub max_dimension: u32,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            port: env::var("CONVERTER_PORT")
                .unwrap_or_else(|_| "8000".to_string())
                .parse()
                .expect("CONVERTER_PORT must be a valid port number"),
            s3_endpoint: env::var("S3_ENDPOINT")
                .unwrap_or_else(|_| "http://rustfs:9000".to_string()),
            s3_access_key: env::var("S3_ACCESS_KEY")
                .unwrap_or_else(|_| "rustfsadmin".to_string()),
            s3_secret_key: env::var("S3_SECRET_KEY")
                .unwrap_or_else(|_| "rustfsadmin".to_string()),
            s3_region: env::var("S3_REGION")
                .unwrap_or_else(|_| "us-east-1".to_string()),
            webp_default_quality: env::var("WEBP_DEFAULT_QUALITY")
                .unwrap_or_else(|_| "85".to_string())
                .parse()
                .expect("WEBP_DEFAULT_QUALITY must be a valid number"),
            max_dimension: env::var("MAX_DIMENSION")
                .unwrap_or_else(|_| "4096".to_string())
                .parse()
                .expect("MAX_DIMENSION must be a valid number"),
        }
    }
}
