use aws_sdk_s3::Client as S3Client;
use uuid::Uuid;

#[derive(Clone)]
pub struct StorageService {
    client: S3Client,
    bucket: String,
}

impl StorageService {
    pub fn new(client: S3Client, bucket: String) -> Self {
        Self { client, bucket }
    }

    pub fn doc_key(id: &Uuid) -> String {
        format!("documents/{id}")
    }

    pub fn thumb_key(id: &Uuid) -> String {
        format!("thumbnails/{id}")
    }

    pub async fn upload_bytes(&self, key: &str, data: Vec<u8>) -> Result<(), AppStorageError> {
        self.client
            .put_object()
            .bucket(&self.bucket)
            .key(key)
            .body(data.into())
            .send()
            .await?;
        Ok(())
    }

    pub async fn download_bytes(&self, key: &str) -> Result<Vec<u8>, AppStorageError> {
        let resp = self
            .client
            .get_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        let bytes = resp.body.collect().await?;
        Ok(bytes.to_vec())
    }

    pub async fn delete_object(&self, key: &str) -> Result<(), AppStorageError> {
        self.client
            .delete_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await?;
        Ok(())
    }

    pub async fn object_exists(&self, key: &str) -> Result<bool, AppStorageError> {
        let result = self
            .client
            .head_object()
            .bucket(&self.bucket)
            .key(key)
            .send()
            .await;
        match result {
            Ok(_) => Ok(true),
            Err(err) => {
                let is_not_found = err.as_service_error().map(|e| e.is_not_found()).unwrap_or(false);
                if is_not_found {
                    Ok(false)
                } else {
                    Err(err.into())
                }
            }
        }
    }
}

#[derive(Debug)]
pub enum AppStorageError {
    S3(String),
}

impl std::fmt::Display for AppStorageError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AppStorageError::S3(msg) => write!(f, "S3 error: {msg}"),
        }
    }
}

impl<E> From<E> for AppStorageError
where
    E: Into<Box<dyn std::error::Error + Send + Sync>>,
{
    fn from(err: E) -> Self {
        AppStorageError::S3(err.into().to_string())
    }
}
