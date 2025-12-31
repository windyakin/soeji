use bytes::Bytes;
use s3::bucket::Bucket;
use s3::creds::Credentials;
use s3::Region;

use crate::config::Config;
use crate::error::ConverterError;

#[derive(Clone)]
pub struct S3Client {
    credentials: Credentials,
    region: Region,
}

impl S3Client {
    pub fn new(config: &Config) -> Result<Self, ConverterError> {
        let credentials = Credentials::new(
            Some(&config.s3_access_key),
            Some(&config.s3_secret_key),
            None,
            None,
            None,
        )
        .map_err(|e| ConverterError::S3Error(e.to_string()))?;

        let region = Region::Custom {
            region: config.s3_region.clone(),
            endpoint: config.s3_endpoint.clone(),
        };

        Ok(Self { credentials, region })
    }

    pub async fn get_object(&self, bucket_name: &str, key: &str) -> Result<Bytes, ConverterError> {
        let bucket = Bucket::new(bucket_name, self.region.clone(), self.credentials.clone())
            .map_err(|e| ConverterError::S3Error(e.to_string()))?
            .with_path_style();

        let response = bucket
            .get_object(key)
            .await
            .map_err(|e| {
                let err_str = e.to_string();
                if err_str.contains("NoSuchKey") || err_str.contains("404") || err_str.contains("not found") {
                    ConverterError::NotFound(format!("{}/{}", bucket_name, key))
                } else {
                    ConverterError::S3Error(err_str)
                }
            })?;

        if response.status_code() == 404 {
            return Err(ConverterError::NotFound(format!("{}/{}", bucket_name, key)));
        }

        Ok(Bytes::from(response.to_vec()))
    }
}
