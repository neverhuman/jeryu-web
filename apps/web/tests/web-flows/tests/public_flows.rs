mod support;

use futures_util::FutureExt;
use serde_json::{Value, json};
use std::panic::AssertUnwindSafe;
use std::{
    env,
    fs::{self, File},
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};
use support::Fixture;
use thirtyfour::prelude::*;
use tokio::time::sleep;

type Result<T> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

struct DriverProcess(Child);
impl Drop for DriverProcess {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

async fn rendered(driver: &WebDriver, expression: &str) -> Result<Value> {
    Ok(driver
        .execute(format!("return ({expression});"), vec![])
        .await?
        .json()
        .clone())
}

async fn until(driver: &WebDriver, expression: &str) -> Result<()> {
    let deadline = Instant::now() + Duration::from_secs(8);
    loop {
        if rendered(driver, expression).await? == json!(true) {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("rendered assertion timed out: {expression}").into());
        }
        sleep(Duration::from_millis(25)).await;
    }
}

async fn click(driver: &WebDriver, selector: &str) -> Result<()> {
    driver
        .query(By::Css(selector))
        .first()
        .await?
        .click()
        .await?;
    Ok(())
}

async fn fill(driver: &WebDriver, selector: &str, value: &str) -> Result<()> {
    let element = driver.query(By::Css(selector)).first().await?;
    element.clear().await?;
    element.send_keys(value).await?;
    Ok(())
}

async fn scene(driver: &WebDriver, opacity: &str) -> Result<String> {
    until(driver, &format!("document.querySelector('[data-testid=dragon-poster]')?.naturalWidth > 0 && getComputedStyle(document.querySelector('[data-testid=dragon-poster]')).opacity === '{opacity}'")).await?;
    assert_eq!(
        rendered(
            driver,
            "document.querySelectorAll('.marketing-header__brand').length"
        )
        .await?,
        json!(1)
    );
    assert_eq!(
        rendered(
            driver,
            "document.querySelector('.marketing-scene').dataset.backgroundMotion"
        )
        .await?,
        json!("running")
    );
    assert_eq!(
        rendered(
            driver,
            "document.documentElement.scrollWidth <= innerWidth + 1"
        )
        .await?,
        json!(true)
    );
    let grid = rendered(
        driver,
        "getComputedStyle(document.querySelector('.marketing-scene'), '::before').backgroundImage",
    )
    .await?;
    let grid = grid.as_str().unwrap().to_string();
    assert!(grid.contains("linear-gradient"), "shared grid is missing");
    Ok(grid)
}

async fn exercise(driver: &WebDriver, fixture: &Fixture, artifacts: &Path) -> Result<()> {
    driver
        .set_page_load_timeout(Duration::from_secs(15))
        .await?;
    driver.goto(&fixture.url).await?;
    until(
        driver,
        "document.querySelector('h1')?.textContent === 'Git for agents.'",
    )
    .await?;
    let grid = scene(driver, "1").await?;
    assert_eq!(
        rendered(driver, "document.querySelectorAll('form').length").await?,
        json!(0)
    );
    assert_eq!(
        rendered(
            driver,
            "document.querySelectorAll('.boot__wordmark').length"
        )
        .await?,
        json!(0)
    );
    driver.screenshot(&artifacts.join("home.png")).await?;
    // Observe actual frame movement, allowing the cycle to wrap between samples.
    let mut moved_left = false;
    for _ in 0..10 {
        let x = rendered(driver, "new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.dragon-landing__flow')).transform).m41").await?.as_f64().unwrap();
        sleep(Duration::from_millis(80)).await;
        let next = rendered(driver, "new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.dragon-landing__flow')).transform).m41").await?.as_f64().unwrap();
        if next < x - 1.0 {
            moved_left = true;
            break;
        }
    }
    assert!(
        moved_left,
        "wakes must travel left behind the right-facing dragon"
    );
    click(driver, ".marketing-header__login").await?;
    assert_eq!(scene(driver, "0.1").await?, grid);
    until(
        driver,
        "document.activeElement?.getAttribute('autocomplete') === 'username'",
    )
    .await?;
    driver
        .screenshot(&artifacts.join("inline-login.png"))
        .await?;
    click(driver, ".boot__back-button").await?;
    assert_eq!(scene(driver, "1").await?, grid);
    click(driver, ".marketing-header__waitlist").await?;
    until(
        driver,
        "location.pathname === '/waitlist' && !!document.querySelector('#waitlist-email')",
    )
    .await?;
    assert_eq!(scene(driver, "0.1").await?, grid);
    click(driver, ".waitlist__submit").await?;
    assert!(
        fixture.posts.lock().unwrap().is_empty(),
        "empty form must not post"
    );
    fill(driver, "#waitlist-email", "ada@example.test").await?;
    fill(driver, "input[name=name]", "Ada").await?;
    fill(driver, "textarea[name=note]", "autonomous work").await?;
    click(driver, ".waitlist__submit").await?;
    until(driver, "document.querySelector('#waitlist-status')?.textContent === \"Thanks, you're on the list.\" && document.querySelector('#waitlist-email')?.value === ''").await?;
    assert_eq!(
        fixture.posts.lock().unwrap()[0].body,
        json!({"email":"ada@example.test","name":"Ada","note":"autonomous work"})
    );
    assert_eq!(rendered(driver, "document.querySelector('input[name=name]').value + document.querySelector('textarea[name=note]').value").await?, json!(""));
    fill(driver, "#waitlist-email", "ada@example.test").await?;
    click(driver, ".waitlist__submit").await?;
    until(driver, "document.querySelector('#waitlist-email')?.value === '' && !document.querySelector('.waitlist__submit')?.disabled").await?;
    assert_eq!(fixture.posts.lock().unwrap().len(), 2);
    for (email, message) in [
        ("limited@example.test", "Too many attempts"),
        ("invalid@example.test", "cannot be saved"),
        ("failed@example.test", "could not be reached"),
    ] {
        fill(driver, "#waitlist-email", email).await?;
        click(driver, ".waitlist__submit").await?;
        until(driver, &format!("document.querySelector('#waitlist-status')?.textContent.includes('{}') && !document.querySelector('.waitlist__submit')?.disabled", message)).await?;
        assert_eq!(
            rendered(
                driver,
                "document.querySelector('#waitlist-email').getAttribute('aria-invalid')"
            )
            .await?,
            json!("true")
        );
    }
    assert!(
        fixture
            .posts
            .lock()
            .unwrap()
            .iter()
            .all(|p| p.path == "/api/v1/waitlist"),
        "waitlist must not create a session/account"
    );
    driver.screenshot(&artifacts.join("waitlist.png")).await?;
    click(driver, ".waitlist-page__back").await?;
    assert_eq!(scene(driver, "1").await?, grid);
    // Direct routes must retain the same scene and restore it after leaving.
    for route in ["/login", "/signup"] {
        driver.goto(format!("{}{route}", fixture.url)).await?;
        assert_eq!(scene(driver, "0.1").await?, grid);
        until(driver, "!!document.querySelector('input[type=password]')").await?;
        driver
            .screenshot(&artifacts.join(format!("{}.png", route.trim_start_matches('/'))))
            .await?;
        click(driver, ".boot__back-button").await?;
        assert_eq!(scene(driver, "1").await?, grid);
    }
    driver.goto(format!("{}/login", fixture.url)).await?;
    fill(driver, "input[autocomplete=username]", "flow-reader").await?;
    fill(
        driver,
        "input[autocomplete=current-password]",
        "fixture-input-0001",
    )
    .await?;
    click(driver, "input[type=checkbox]").await?;
    click(driver, "form button[type=submit]").await?;
    until(
        driver,
        "document.body.textContent.includes('Fixture credentials rejected')",
    )
    .await?;
    let login = fixture.posts.lock().unwrap().last().unwrap().clone();
    assert_eq!(login.path, "/api/v1/auth/login");
    assert_eq!(
        login.body,
        json!({"login":"flow-reader","password":"fixture-input-0001","rememberMe":true})
    );
    assert_eq!(scene(driver, "0.1").await?, grid);
    let unexpected = fixture.unexpected.lock().unwrap().clone();
    assert!(unexpected.is_empty(), "unexpected API: {unexpected:?}");
    Ok(())
}

#[tokio::test]
async fn public_site_journey() -> Result<()> {
    let started = Instant::now();
    let repo = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../..")
        .canonicalize()?;
    let artifacts = repo.join("target/web-flows");
    fs::create_dir_all(&artifacts)?;
    let fixture = Fixture::start(repo.join("apps/web/dist")).await;
    let port = TcpListener::bind("127.0.0.1:0")?.local_addr()?.port();
    let log = File::create(artifacts.join("chromedriver.log"))?;
    let mut process = DriverProcess(
        Command::new(env::var("CHROMEDRIVER_BIN")?)
            .arg(format!("--port={port}"))
            .arg("--allowed-ips=127.0.0.1")
            .stdout(Stdio::from(log.try_clone()?))
            .stderr(Stdio::from(log))
            .spawn()?,
    );
    let mut caps = DesiredCapabilities::chrome();
    caps.set_binary(&env::var("CHROME_BIN")?)?;
    for arg in [
        "--headless=new",
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--window-size=1440,1100",
    ] {
        caps.add_arg(arg)?;
    }
    let driver = {
        let deadline = Instant::now() + Duration::from_secs(15);
        loop {
            if let Some(status) = process.0.try_wait()? {
                return Err(format!("ChromeDriver exited {status}; see chromedriver.log").into());
            }
            match WebDriver::new(format!("http://127.0.0.1:{port}"), caps.clone()).await {
                Ok(driver) => break driver,
                Err(error) if Instant::now() >= deadline => return Err(error.into()),
                Err(_) => sleep(Duration::from_millis(100)).await,
            }
        }
    };
    let result = match AssertUnwindSafe(exercise(&driver, &fixture, &artifacts))
        .catch_unwind()
        .await
    {
        Ok(result) => result,
        Err(_) => Err("rendered assertion failed; see failure artifacts and test output".into()),
    };
    if result.is_err() {
        let _ = driver.screenshot(&artifacts.join("failure.png")).await;
        if let Ok(source) = driver.source().await {
            let _ = fs::write(artifacts.join("failure.html"), source);
        }
    }
    let quit = driver.quit().await;
    fs::write(
        artifacts.join("receipt.json"),
        serde_json::to_vec_pretty(&json!({
            "schema":"jeryu.web-flows/v1", "engine":"Rust / ChromeDriver / built SPA", "status":if result.is_ok() && quit.is_ok() {"passed"} else {"failed"},
            "elapsed_ms":started.elapsed().as_millis(), "post_count":fixture.posts.lock().unwrap().len(),
            "flows":["home","leftward-motion","inline-login","opacity-restore","waitlist-validation","waitlist-receipt-repeat","waitlist-429-422-503","direct-login-signup","login-wire-contract"]
        }))?,
    )?;
    result?;
    quit?;
    Ok(())
}
