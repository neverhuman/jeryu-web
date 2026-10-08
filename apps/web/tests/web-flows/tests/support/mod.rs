use serde_json::{Value, json};
use std::{
    fs,
    io::Read,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread::{self, JoinHandle},
    time::Duration,
};
use tiny_http::{Header, Response, Server};

#[derive(Clone, Debug)]
pub struct Post {
    pub path: String,
    pub body: Value,
}

pub struct Fixture {
    pub url: String,
    pub posts: Arc<Mutex<Vec<Post>>>,
    pub unexpected: Arc<Mutex<Vec<String>>>,
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

impl Fixture {
    pub fn start(dist: PathBuf) -> Self {
        let root = dist.canonicalize().expect("build apps/web/dist first");
        assert!(
            root.join("index.html").is_file(),
            "production index missing"
        );
        let server = Server::http("127.0.0.1:0").expect("bind fixture server");
        let url = format!("http://{}", server.server_addr());
        let posts = Arc::new(Mutex::new(Vec::new()));
        let unexpected = Arc::new(Mutex::new(Vec::new()));
        let stop = Arc::new(AtomicBool::new(false));
        let server = Arc::new(server);
        let threads = (0..8).map(|_| {
            let (captured, unhandled, stopping) = (posts.clone(), unexpected.clone(), stop.clone());
            let (server, root) = (server.clone(), root.clone());
            thread::spawn(move || {
            while !stopping.load(Ordering::Relaxed) {
                let Some(mut request) = server.recv_timeout(Duration::from_millis(20)).unwrap()
                else {
                    continue;
                };
                let path = request.url().split('?').next().unwrap().to_string();
                let method = request.method().as_str().to_string();
                let (status, mime, bytes) = if path.starts_with("/api/") {
                    let mut raw = String::new();
                    request
                        .as_reader()
                        .take(16_384)
                        .read_to_string(&mut raw)
                        .unwrap();
                    let body: Value = serde_json::from_str(&raw).unwrap_or(Value::Null);
                    if method == "POST" {
                        captured.lock().unwrap().push(Post {
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
                            unhandled.lock().unwrap().push(format!("{method} {path}"));
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
                    let requested = root.join(path.trim_start_matches('/'));
                    let file = requested
                        .canonicalize()
                        .ok()
                        .filter(|p| p.starts_with(&root) && p.is_file());
                    let file = file.unwrap_or_else(|| root.join("index.html"));
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
                let response = Response::from_data(bytes)
                    .with_status_code(status)
                    .with_header(Header::from_bytes("Content-Type", mime).unwrap())
                    .with_header(Header::from_bytes("Cache-Control", if mime == "text/html" || mime == "application/json" { "no-store" } else { "public, max-age=3600" }).unwrap());
                eprintln!("fixture: {method} {path} -> {status}");
                request.respond(response).unwrap();
            }
            })
        }).collect();
        Self {
            url,
            posts,
            unexpected,
            stop,
            threads,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        for thread in self.threads.drain(..) {
            thread.join().unwrap();
        }
    }
}
