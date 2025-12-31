use axum::http::StatusCode;

pub async fn root() -> StatusCode {
    StatusCode::OK
}
