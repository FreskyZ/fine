use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand};
use hex::encode as hex_encode;
use hmac::{Hmac, Mac, KeyInit};
use reqwest::{header::HeaderMap, Client, Method, RequestBuilder};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use tokio::fs::File;
use tokio::io::AsyncWriteExt;
use url::Url;
use xml::reader::XmlEvent;
use xml::EventReader;

// ---------- Configuration ----------
#[derive(Debug, Deserialize)]
struct Config {
    region: String,
    internal: bool,
    bucket: String,
    #[serde(rename = "access-key-id")]
    access_key_id: String,
    #[serde(rename = "access-key-secret")]
    access_key_secret: String,
}
#[derive(Debug, Deserialize)]
struct ConfigWrapper {
    aliyunoss: Config,
}

// ---------- Logging ----------
struct Logger {
    entries: Vec<String>,
}

impl Logger {
    fn new() -> Self {
        Self { entries: Vec::new() }
    }

    fn log(&mut self, msg: String) {
        let timestamp = Utc::now().format("%H:%M:%S%.3f").to_string();
        let line = format!("{} {}", timestamp, msg);
        println!("{}", line); // also print to stderr for visibility
        self.entries.push(line);
    }

    async fn save_to_file(&self, path: &str) -> std::io::Result<()> {
        let content = self.entries.join("\n");
        fs::write(path, content)
    }
}

// ---------- Request Signing ----------
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC key");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

fn sha256_hex(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hex_encode(hasher.finalize())
}

fn percent_encode(segment: &str) -> String {
    // Encode according to JS encodeURIComponent rules: !'()* are encoded as %hex
    let mut encoded = String::new();
    for ch in segment.chars() {
        match ch {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' => encoded.push(ch),
            '!' => encoded.push_str("%21"),
            '\'' => encoded.push_str("%27"),
            '(' => encoded.push_str("%28"),
            ')' => encoded.push_str("%29"),
            '*' => encoded.push_str("%2A"),
            _ => {
                for b in ch.to_string().as_bytes() {
                    encoded.push_str(&format!("%{:02X}", b));
                }
            }
        }
    }
    encoded
}

fn canonical_uri(bucket: &str, object: Option<&str>) -> String {
    let raw = format!("/{}/{}", bucket, object.unwrap_or(""));
    raw.split('/')
        .map(|seg| percent_encode(seg))
        .collect::<Vec<_>>()
        .join("/")
}

fn canonical_query(query: &BTreeMap<String, String>) -> String {
    if query.is_empty() {
        return String::new();
    }
    let mut pairs: Vec<(String, String)> = query
        .iter()
        .map(|(k, v)| (k.to_lowercase(), v.clone()))
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    pairs
        .iter()
        .map(|(k, v)| format!("{}={}", percent_encode(k), percent_encode(v)))
        .collect::<Vec<_>>()
        .join("&")
}

fn canonical_headers(headers: &HeaderMap, additional_header_names: &mut Vec<String>) -> String {
    let mut sorted: Vec<(String, String)> = headers
        .iter()
        .map(|(k, v)| (k.as_str().to_lowercase(), v.to_str().unwrap_or("").to_string()))
        .collect();
    sorted.sort_by(|a, b| a.0.cmp(&b.0));
    let mut result = String::new();
    for (name, value) in &sorted {
        let trimmed_name = name.trim();
        let trimmed_value = value.trim();
        result.push_str(&format!("{}:{}\n", trimmed_name, trimmed_value));
        if trimmed_name != "content-type"
            && trimmed_name != "content-md5"
            && !trimmed_name.starts_with("x-oss-")
        {
            additional_header_names.push(trimmed_name.to_string());
        }
    }
    result
}

fn build_authorization(
    access_key_id: &str,
    secret_key: &str,
    region: &str,
    datetime: DateTime<Utc>,
    canonical_request: &str,
    additional_headers: &[String],
) -> String {
    let yyyymmdd = datetime.format("%Y%m%d").to_string();
    let credential_scope = format!("{}/{}/oss/aliyun_v4_request", yyyymmdd, region);
    let string_to_sign = format!(
        "OSS4-HMAC-SHA256\n{}\n{}\n{}",
        datetime.format("%Y%m%dT%H%M%SZ"),
        credential_scope,
        sha256_hex(canonical_request)
    );

    // Derive signing key
    let k_secret = format!("aliyun_v4{}", secret_key);
    let k_date = hmac_sha256(k_secret.as_bytes(), yyyymmdd.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"oss");
    let k_signing = hmac_sha256(&k_service, b"aliyun_v4_request");
    let signature = hex_encode(hmac_sha256(&k_signing, string_to_sign.as_bytes()));

    let additional = if additional_headers.is_empty() {
        String::new()
    } else {
        format!(",AdditionalHeaders={}", additional_headers.join(";"))
    };
    format!(
        "OSS4-HMAC-SHA256 Credential={}/{}{},Signature={}",
        access_key_id, credential_scope, additional, signature
    )
}

// ---------- Core Request ----------
async fn send_request(
    config: &Config,
    method: Method,
    object: Option<&str>,
    query: BTreeMap<String, String>,
    mut headers: HeaderMap,
    body: Option<Vec<u8>>,
    logger: &mut Logger,
) -> Result<reqwest::Response, anyhow::Error> {
    let datetime = Utc::now();
    // Required headers
    if let Some(body_len) = body.as_ref().map(|b| b.len()) {
        headers.insert("content-length", body_len.to_string().parse().unwrap());
    }
    headers.insert(
        "x-oss-content-sha256",
        "UNSIGNED-PAYLOAD".parse().unwrap(),
    );
    headers.insert(
        "x-oss-date",
        datetime.format("%Y%m%dT%H%M%SZ").to_string().parse().unwrap(),
    );

    // Build canonical parts
    let uri = canonical_uri(&config.bucket, object);
    let query_str = canonical_query(&query);
    let mut additional_headers = Vec::new();
    let canonical_headers = canonical_headers(&headers, &mut additional_headers);
    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\nUNSIGNED-PAYLOAD",
        method.as_str(),
        uri,
        query_str,
        canonical_headers,
        additional_headers.join(";")
    );
    logger.log(format!("canonical request:\n{}", canonical_request));

    let auth = build_authorization(
        &config.access_key_id,
        &config.access_key_secret,
        &config.region,
        datetime,
        &canonical_request,
        &additional_headers,
    );
    headers.insert("authorization", auth.parse().unwrap());

    // Build URL
    let scheme = "https";
    let subdomain = if config.internal { "-internal" } else { "" };
    let host = format!(
        "{}.oss-{}{}.aliyuncs.com",
        config.bucket, config.region, subdomain
    );
    let mut url = Url::parse(&format!("{}://{}/", scheme, host)).unwrap();
    if let Some(obj) = object {
        url.set_path(obj);
    }
    for (k, v) in &query {
        url.query_pairs_mut().append_pair(k, v);
    }

    logger.log(format!("url: {}", url));
    logger.log(format!("headers: {:?}", headers));

    let client = Client::new();
    let mut req_builder = client.request(method.clone(), url);
    for (name, value) in headers.iter() {
        req_builder = req_builder.header(name, value);
    }
    if let Some(body_bytes) = body {
        req_builder = req_builder.body(body_bytes);
    }
    let response = req_builder.send().await?;
    logger.log(format!("response status: {}", response.status()));
    Ok(response)
}

// ---------- XML Parsing Helpers ----------
fn parse_error_xml(xml: &str) -> Option<String> {
    let reader = EventReader::from_str(xml);
    let mut expect_code = false;
    let mut code = None;
    for event in reader.into_iter() {
        match event {
            Ok(XmlEvent::StartElement { name, .. }) if name.local_name == "Code" => {
                expect_code = true;
            },
            Ok(XmlEvent::Characters(text)) if expect_code => {
                code = Some(text);
            },
            // TODO this
            // Err(e) => return Err(anyhow!("XML parse error: {}", e)),
            _ => {},
        }
    }
    code
}

fn parse_list_response(xml: &str) -> Result<(Vec<ListFile>, Option<String>), String> {
    let reader = EventReader::from_str(xml);
    let mut files = Vec::new();
    let mut next_token = None;
    let mut current_key = None;
    let mut current_size = None;
    let mut current_last_modified = None;
    let mut in_contents = false;

    for event in reader.into_iter() {
        match event {
            Ok(XmlEvent::StartElement { name, .. }) => match name.local_name.as_str() {
                "Contents" => in_contents = true,
                "Key" if in_contents => current_key = Some(String::new()),
                "Size" if in_contents => current_size = Some(String::new()),
                "LastModified" if in_contents => current_last_modified = Some(String::new()),
                "NextContinuationToken" => next_token = Some(String::new()),
                _ => {}
            },
            Ok(XmlEvent::Characters(text)) => {
                if let Some(ref mut key) = current_key {
                    key.push_str(&text);
                }
                if let Some(ref mut size) = current_size {
                    size.push_str(&text);
                }
                if let Some(ref mut lm) = current_last_modified {
                    lm.push_str(&text);
                }
                if let Some(ref mut token) = next_token {
                    token.push_str(&text);
                }
            }
            Ok(XmlEvent::EndElement { name, .. }) => match name.local_name.as_str() {
                "Contents" => {
                    if let (Some(key), Some(size), Some(last_modified)) =
                        (current_key.take(), current_size.take(), current_last_modified.take())
                    {
                        let size = size.parse::<u64>().unwrap_or(0);
                        files.push(ListFile {
                            name: key,
                            size,
                            mtime: last_modified,
                        });
                    }
                    in_contents = false;
                }
                "Key" => {}
                "Size" => {}
                "LastModified" => {}
                "NextContinuationToken" => {}
                _ => {}
            },
            Err(e) => return Err(format!("XML parse error: {}", e)),
            _ => {}
        }
    }
    Ok((files, next_token))
}

// ---------- Types for OSS Operations ----------
#[derive(Debug)]
struct ListFile {
    name: String,
    size: u64,
    mtime: String,
}

struct ListOptions {
    count: Option<u32>,
    start_after: Option<String>,
    prefix: Option<String>,
    continue_flag: bool,
}

struct UploadOptions {
    filename: String,
    content: Vec<u8>,
    forbid_overwrite: bool,
}

struct DownloadOptions {
    filename: String,
}

struct RemoveOptions {
    filename: String,
}

// ---------- Operations ----------
async fn list_objects(
    config: &Config,
    opts: ListOptions,
    logger: &mut Logger,
) -> Result<Vec<ListFile>, String> {
    let mut continuation_token: Option<String> = None;
    let mut all_files = Vec::new();
    let mut loop_count = 0;

    loop {
        let mut query = BTreeMap::new();
        query.insert("list-type".to_string(), "2".to_string());
        if let Some(ref sa) = opts.start_after {
            query.insert("start-after".to_string(), sa.clone());
        }
        if let Some(ref token) = continuation_token {
            query.insert("continuation-token".to_string(), token.clone());
        }
        if let Some(max) = opts.count {
            query.insert("max-keys".to_string(), max.to_string());
        }
        if let Some(ref prefix) = opts.prefix {
            query.insert("prefix".to_string(), prefix.clone());
        }

        let response = send_request(
            config,
            Method::GET,
            None, // bucket-level operation
            query,
            HeaderMap::new(),
            None,
            logger,
        )
        .await
        .map_err(|e| format!("request error: {}", e))?;

        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();

        if !status.is_success() {
            let code = parse_error_xml(&body_text);
            return Err(code.unwrap_or_else(|| format!("HTTP {}", status)));
        }

        match parse_list_response(&body_text) {
            Ok((mut files, next_token_opt)) => {
                all_files.append(&mut files);
                if !opts.continue_flag || next_token_opt.is_none() {
                    break;
                }
                continuation_token = next_token_opt;
            }
            Err(e) => return Err(e),
        }

        loop_count += 1;
        if loop_count > 100 {
            return Err("too many pagination loops".to_string());
        }
    }
    Ok(all_files)
}

async fn upload_object(
    config: &Config,
    opts: UploadOptions,
    logger: &mut Logger,
) -> Result<(), String> {
    let mut headers = HeaderMap::new();
    if opts.forbid_overwrite {
        headers.insert("x-oss-forbid-overwrite", "true".parse().unwrap());
    }
    let response = send_request(
        config,
        Method::PUT,
        Some(&opts.filename),
        BTreeMap::new(),
        headers,
        Some(opts.content),
        logger,
    )
    .await
    .map_err(|e| format!("request error: {}", e))?;

    let status = response.status();
    if status.is_success() {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        let code = parse_error_xml(&body);
        Err(code.unwrap_or_else(|| format!("HTTP {}", status)))
    }
}

async fn download_object(
    config: &Config,
    opts: DownloadOptions,
    logger: &mut Logger,
) -> Result<Vec<u8>, String> {
    let response = send_request(
        config,
        Method::GET,
        Some(&opts.filename),
        BTreeMap::new(),
        HeaderMap::new(),
        None,
        logger,
    )
    .await
    .map_err(|e| format!("request error: {}", e))?;

    let status = response.status();
    if status.is_success() {
        response
            .bytes()
            .await
            .map(|b| b.to_vec())
            .map_err(|e| format!("read body: {}", e))
    } else {
        let body = response.text().await.unwrap_or_default();
        let code = parse_error_xml(&body);
        Err(code.unwrap_or_else(|| format!("HTTP {}", status)))
    }
}

async fn remove_object(
    config: &Config,
    opts: RemoveOptions,
    logger: &mut Logger,
) -> Result<(), String> {
    let response = send_request(
        config,
        Method::DELETE,
        Some(&opts.filename),
        BTreeMap::new(),
        HeaderMap::new(),
        None,
        logger,
    )
    .await
    .map_err(|e| format!("request error: {}", e))?;

    let status = response.status();
    if status.is_success() || status == reqwest::StatusCode::NO_CONTENT {
        Ok(())
    } else {
        let body = response.text().await.unwrap_or_default();
        let code = parse_error_xml(&body);
        Err(code.unwrap_or_else(|| format!("HTTP {}", status)))
    }
}

// ---------- CLI ----------
#[derive(Parser)]
#[command(name = "alioss", about = "Aliyun OSS CLI tool")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// List objects in bucket
    List {
        /// Maximum number of objects to return
        #[arg(long)]
        count: Option<u32>,
        /// Start after this key name
        #[arg(long)]
        start_after: Option<String>,
        /// Filter objects with this prefix
        #[arg(long)]
        prefix: Option<String>,
        /// Continue fetching all pages automatically
        #[arg(long)]
        continue_flag: bool,
    },
    /// Upload a file
    Upload {
        /// Local file path to upload
        filename: String,
        /// Do not overwrite existing object
        #[arg(long)]
        forbid_overwrite: bool,
    },
    /// Download an object
    Download {
        /// Object name to download
        filename: String,
    },
    /// Remove an object
    Remove {
        /// Object name to delete
        filename: String,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    // Read config
    let config_path = "/etc/fine/backup.yml";
    let config_content = fs::read_to_string(config_path)
        .map_err(|e| format!("Failed to read config file {}: {}", config_path, e))?;
    let config_wrapper: ConfigWrapper = serde_yml::from_str(&config_content)
        .map_err(|e| format!("Failed to parse YAML config: {}", e))?;
    let config = config_wrapper.aliyunoss;

    let mut logger = Logger::new();

    match cli.command {
        Commands::List {
            count,
            start_after,
            prefix,
            continue_flag,
        } => {
            logger.log("alioss: list".to_string());
            let opts = ListOptions {
                count,
                start_after,
                prefix,
                continue_flag,
            };
            match list_objects(&config, opts, &mut logger).await {
                Ok(files) => {
                    for file in &files {
                        println!(
                            "  {} {} bytes at {}",
                            file.name, file.size, file.mtime
                        );
                    }
                    logger.log(format!("list success, {} objects", files.len()));
                }
                Err(e) => {
                    logger.log(format!("list error: {}", e));
                    eprintln!("Error: {}", e);
                }
            }
        }
        Commands::Upload {
            filename,
            forbid_overwrite,
        } => {
            logger.log(format!("alioss: upload {}", filename));
            let content = tokio::fs::read(&filename).await
                .map_err(|e| format!("Failed to read file {}: {}", filename, e))?;
            let opts = UploadOptions {
                filename: filename.clone(),
                content,
                forbid_overwrite,
            };
            match upload_object(&config, opts, &mut logger).await {
                Ok(()) => logger.log(format!("upload {} success", filename)),
                Err(e) => {
                    logger.log(format!("upload error: {}", e));
                    eprintln!("Error: {}", e);
                }
            }
        }
        Commands::Download { filename } => {
            logger.log(format!("alioss: download {}", filename));
            match download_object(&config, DownloadOptions { filename: filename.clone() }, &mut logger).await {
                Ok(content) => {
                    let basename = std::path::Path::new(&filename)
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    tokio::fs::write(&basename, &content).await
                        .map_err(|e| format!("Failed to write {}: {}", basename, e))?;
                    logger.log(format!("download {} success, wrote {} ({} bytes)", filename, basename, content.len()));
                }
                Err(e) => {
                    logger.log(format!("download error: {}", e));
                    eprintln!("Error: {}", e);
                }
            }
        }
        Commands::Remove { filename } => {
            logger.log(format!("alioss: remove {}", filename));
            match remove_object(&config, RemoveOptions { filename: filename.clone() }, &mut logger).await {
                Ok(()) => logger.log(format!("remove {} success", filename)),
                Err(e) => {
                    logger.log(format!("remove error: {}", e));
                    eprintln!("Error: {}", e);
                }
            }
        }
    }

    logger.save_to_file("/tmp/alioss.log").await.ok();
    Ok(())
}

// docker run -it --rm --name alioss1 -v ~/cargo-build-cache-alioss:/work/target -v ~/cargo-download-cache:/usr/local/cargo/registry -h RUST -w /work my/rust:1
// mkdir src
// docker cp setup/alioss.rs alioss1:/work/src/main.rs
// docker cp setup/alioss.toml alioss1:/work/Cargo.toml
// docker cp setup/alioss.lock alioss1:/work/Cargo.lock
// apk add musl-dev
// cargo b --release
// docker cp alioss1:/work/target/release/alioss aoc