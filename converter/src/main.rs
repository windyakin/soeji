mod config;
mod error;
mod handlers;
mod services;

use axum::{
    routing::get,
    Router,
};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use config::Config;
use services::s3::S3Client;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub s3_client: S3Client,
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "soeji_converter=info,tower_http=info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env();
    let port = config.port;

    tracing::info!("Starting soeji-converter on port {}", port);
    tracing::info!("S3 endpoint: {}", config.s3_endpoint);

    // Initialize S3 client
    let s3_client = S3Client::new(&config).expect("Failed to initialize S3 client");

    // Create app state
    let state = AppState { config, s3_client };

    // Build router
    let app = Router::new()
        .route("/", get(handlers::root::root))
        .route("/health", get(handlers::health::health_check))
        .route("/*path", get(handlers::image::get_image))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
