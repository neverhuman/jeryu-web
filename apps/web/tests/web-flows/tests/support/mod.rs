use axum::{
    Router,
    body::{Body, to_bytes},
    extract::{Request, State},
    http::Response,
    routing::any,
};
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::task::JoinHandle;

#[derive(Clone, Debug)]
pub struct Post {
    pub path: String,
    pub body: Value,
}

#[derive(Clone)]
struct FixtureState {
    root: PathBuf,
    posts: Arc<Mutex<Vec<Post>>>,
    unexpected: Arc<Mutex<Vec<String>>>,
}

pub struct Fixture {
    pub url: String,
    pub posts: Arc<Mutex<Vec<Post>>>,
    pub unexpected: Arc<Mutex<Vec<String>>>,
    task: JoinHandle<()>,
}

impl Fixture {
    pub async fn start(dist: PathBuf) -> Self {
        let root = dist.canonicalize().expect("build apps/web/dist first");
        assert!(
            root.join("index.html").is_file(),
            "production index missing"
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let posts = Arc::new(Mutex::new(Vec::new()));
        let unexpected = Arc::new(Mutex::new(Vec::new()));
        let state = FixtureState {
            root,
            posts: posts.clone(),
            unexpected: unexpected.clone(),
        };
        let app = Router::new().fallback(any(respond)).with_state(state);
        // Async connections keep parallel module preloads from occupying all
        // request workers while Chrome waits for another dependency.
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self {
            url,
            posts,
            unexpected,
            task,
        }
    }
}

async fn respond(State(state): State<FixtureState>, request: Request) -> Response<Body> {
    let path = request.uri().path().to_string();
    let method = request.method().as_str().to_string();
    let (status, mime, bytes) = if path.starts_with("/api/") {
        let raw = to_bytes(request.into_body(), 16_384).await.unwrap();
        let body: Value = serde_json::from_slice(&raw).unwrap_or(Value::Null);
        if method == "POST" {
            state.posts.lock().unwrap().push(Post {
                path: path.clone(),
                body: body.clone(),
            });
        }
        let (status, value) = match (method.as_str(), path.as_str()) {
            ("GET", "/api/v1/auth/me") => (
                401,
                json!({"error":{"code":"unauthorized","message":"login required"}}),
            ),
            ("POST", "/api/v1/waitlist") => match body["email"].as_str() {
                Some("limited@example.test") => (
                    429,
                    json!({"error":{"code":"rate_limited","message":"rate limited"}}),
                ),
                Some("invalid@example.test") => (
                    422,
                    json!({"error":{"code":"invalid_email","message":"invalid email"}}),
                ),
                Some("failed@example.test") => (
                    503,
                    json!({"error":{"code":"unavailable","message":"unavailable"}}),
                ),
                _ => (202, json!({"result":"received"})),
            },
            ("POST", "/api/v1/auth/login") => (
                401,
                json!({"error":{"code":"unauthorized","message":"Fixture credentials rejected"}}),
            ),
            _ => {
                state
                    .unexpected
                    .lock()
                    .unwrap()
                    .push(format!("{method} {path}"));
                (
                    500,
                    json!({"error":{"code":"unmocked_flow_api","message":"unhandled fixture request"}}),
                )
            }
        };
        (
            status,
            "application/json",
            serde_json::to_vec(&value).unwrap(),
        )
    } else {
        let requested = state.root.join(path.trim_start_matches('/'));
        let file = requested
            .canonicalize()
            .ok()
            .filter(|p| p.starts_with(&state.root) && p.is_file());
        let file = file.unwrap_or_else(|| state.root.join("index.html"));
        let mime = match file.extension().and_then(|x| x.to_str()) {
            Some("js") => "text/javascript",
            Some("css") => "text/css",
            Some("svg") => "image/svg+xml",
            Some("webp") => "image/webp",
            Some("woff2") => "font/woff2",
            _ => "text/html",
        };
        (200, mime, fs::read(file).unwrap())
    };
    eprintln!("fixture: {method} {path} -> {status}");
    Response::builder()
        .status(status)
        .header("Content-Type", mime)
        .header(
            "Cache-Control",
            if mime == "text/html" || mime == "application/json" {
                "no-store"
            } else {
                "public, max-age=3600"
            },
        )
        .body(Body::from(bytes))
        .unwrap()
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.task.abort();
    }
}
