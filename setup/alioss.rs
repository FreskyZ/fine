use std::fmt::Write;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand, Args};
use hmac::{Hmac, Mac, KeyInit};
use log::{trace, info};
use reqwest::{Client, Request, Method};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{fs::{File, read_to_string}, io::AsyncWriteExt};

#[derive(Parser)]
#[command(about = "Aliyun OSS CLI tool")]
struct Command {
    #[arg(
        short,
        long,
        help = "config file for region/bucket/key",
        value_name = "PATH",
        env = "OSS_CONFIG"
    )]
    config_path: String,
    #[command(subcommand)]
    kind: CommandKind,
}
#[derive(Subcommand)]
enum CommandKind {
    #[command(about = "list or query objects")]
    List(ListCommand),
    #[command(about = "upload object")]
    Upload(UploadCommand),
    #[command(about = "download object")]
    Download(DownloadCommand),
    #[command(about = "remove object")]
    Remove(RemoveCommand),
}
#[derive(Args)]
struct ListCommand {
    #[arg(long, help = "limit result count")]
    count: Option<usize>,
    #[arg(long, help = "filter by names compare after this name exclusive", value_name = "NAME")]
    start_after: Option<String>,
    #[arg(long, help = "filter by prefix")]
    prefix: Option<String>,
    #[arg(long,
        help = "continue fetch all results",
        long_help = "continue fetch all results\nwhen use together with count, count is per page count"
    )]
    r#continue: bool,
}
#[derive(Args)]
struct UploadCommand {
    filename: String,
    #[arg(long, value_name = "OBJECT", help = "object name, default to filename")]
    object_name: Option<String>,
    #[arg(short = 'O', long, help = "avoid overwrite existing object")]
    forbid_overwrite: bool,
}
#[derive(Args)]
struct DownloadCommand {
    filename: String,
    #[arg(long, value_name = "OBJECT", help = "object name, default to filename")]
    object_name: Option<String>,
}
#[derive(Args)]
struct RemoveCommand {
    object_name: String,
}

#[derive(Deserialize)]
struct Config {
    region: String,
    internal: bool,
    bucket: String,
    #[serde(rename = "access-key-id")]
    access_key_id: String,
    #[serde(rename = "access-key-secret")]
    access_key_secret: String,
}

// for encodeURIComponent:
// - see https://url.spec.whatwg.org/#percent-encoded-bytes
//   C0 Control percent-encode set: 0..=0x1f + 0x7f, which is provided in percent_encoding::CONTROLS
//   query set = c0 set + 0x20, 0x22, 0x23, 0x3c, 0x3e
//   path set = query set + 0x3f, 0x5e, 0x60, 0x7b, 0x7d
//   userinfo set = path set + 0x2f, 0x3a, 0x3b, 0x3d, 0x40, 0x5b, 0x5c, 0x5d, 0x7c
//   component set = userinfo set + 0x24, 0x25, 0x26, 0x2b, 0x2c, this is encodeURIComponent
// - see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent
//   all characters except A–Z a–z 0–9 - _ . ! ~ * ' ( )
// they are same, if you are interested in manually marking in an ascii table

// see usage, these characters are NOT included in percent encoding
fn is_filename_character(c: char) -> bool {
    matches!(c, 'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~')
}
// these characters are NOT included in encodeURIComponent
fn is_uri_component_character(c: char) -> bool {
    matches!(c, 'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | '~' | '!' | '*' | '\'' | '(' | ')')
}

// you cannot easily use RequestBuilder or Request for operations in this script
// so the answer is make request from custom request properties
fn make_request(
    config: &Config,
    client: &Client,
    // time is used 4??!! times in request signing process,
    // use the same time for these usages, not sure what will happen if one or some are different
    time: DateTime<Utc>,
    method: Method,
    // object name, may be omit for some of the operations,
    // lifetime is actually same as command
    object_name: Option<&str>,
    // key lifetime is likely static, value lifetime is likely static or same as command
    // take ownership of vec
    queries: Vec<(&str, &str)>,
    // - key lifetime is likely static, value lifetime is likely static or same as command
    // - take ownership of vec
    // - cannot use reqwest::HeaderMap because that order is arbitrary
    // - this function will add content-length, content-type, x-oss-date, x-oss-content-sha256
    headers: Vec<(&str, &str)>,
    // body and size
    body: Option<(reqwest::Body, usize)>,
) -> Result<Request> {

    // official sdk source code https://github.com/ali-sdk/ali-oss/blob/master/lib/common/signUtils.js
    // signature document https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4
    // NOTE don't read the graph or image in the document, it contains incorrect information, read the detail tables

    // now that I have consumed headers and queries vec but
    // borrow checker still think adding reference to variables in this scope is not live long enough,
    // so the correct answer is ? you have no way to explicitly specify a vec with reference with lifetime of current function
    let dummy_element = String::new();
    let mut dummy_queries = Vec::new();
    dummy_queries.push((dummy_element.as_str(), dummy_element.as_str()));
    queries.into_iter().for_each(|(k, v)| dummy_queries.push((k, v)));
    let mut queries = Vec::new();
    dummy_queries.into_iter().skip(1).for_each(|(k, v)| queries.push((k, v)));
    let mut dummy_headers = Vec::new();
    dummy_headers.push((dummy_element.as_str(), dummy_element.as_str()));
    headers.into_iter().for_each(|(k, v)| dummy_headers.push((k, v)));
    let mut headers = Vec::new();
    dummy_headers.into_iter().skip(1).for_each(|(k, v)| headers.push((k, v)));

    let body_size_string: String; // this is how you extend lifetime of number.to_string()
    if let Some((_, size)) = &body {
        headers.push(("content-type", "application/octet-stream"));
        body_size_string = size.to_string();
        headers.push(("content-length", body_size_string.as_str()));
    }
    // this does not work
    // headers['accept'] = 'application/json,*/*';
    // this is not in api reference and example, but seems required according to document and official code
    // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.js#L34
    headers.push(("x-oss-content-sha256", "UNSIGNED-PAYLOAD"));
    // this is not in api reference and example, but seems required according to document and official code
    // this will raise error if you give fractions of seconds
    let time_rfc3339 = time.format("%Y%m%dT%H%M%SZ").to_string();
    headers.push(("x-oss-date", time_rfc3339.as_str()));

    // /bucketname/objectname, or /bucketname/ for bucket level operations that don't have an object name
    // - in theory you can avoid this level of string builders by using a canonical_request builder,
    //   but that's too cubersome and avoiding .map(format()).collectVec().join() should be good enough
    // - document does not say whether sort is happened after lowercase
    //   official code sort after lowercase and sign according to lowercase but does not require request itself to enforce lowercase
    let mut canonical_uri = String::new();
    for segment in std::iter::once(config.bucket.as_str()).chain(object_name.unwrap_or("").split('/')).filter(|s| !s.is_empty()) {
        canonical_uri.push('/');
        for c in segment.chars() {
            // see https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/signUtils.js#L154
            // the official code use a custom encodeString implementation that include this
            // encodeURIComponent(tempStr).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
            if is_filename_character(c) {
                canonical_uri.push(c);
            } else {
                write!(&mut canonical_uri, "%{:02X}", c as u32)?;
            }
        }
    }
    if object_name.is_none() { canonical_uri.push('/'); }

    // this time even official code does not clearly show whether lowercase happen in sort, sign and request
    // so use same pattern like canonical uri, as the old typescript code works like this and works fine for long time
    queries.sort_by(|(q1, _), (q2, _)| q1.to_ascii_lowercase().cmp(&q2.to_ascii_lowercase()));
    let mut canonical_query = String::new();
    for &(key, value) in &queries {
        for c in key.trim().to_ascii_lowercase().chars() {
            if is_uri_component_character(c) {
                canonical_query.push(c);
            } else {
                write!(&mut canonical_query, "%{:02X}", c as u32)?;
            }
        }
        canonical_query.push('=');
        for c in value.trim().chars() {
            if is_uri_component_character(c) {
                canonical_query.push(c);
            } else {
                write!(&mut canonical_query, "%{:02X}", c as u32)?;
            }
        }
        canonical_query.push('&')
    }
    if !canonical_query.is_empty() { canonical_query.pop(); }

    // must include headers: x-oss-content-sha256
    // must include headers if exist: content-type, content-md5 and x-oss-*
    // include additional headers:
    // the signing algorithm need you to delcare additional headers used in the calculation process,
    // except required headers, required headers are content-type, content-md5 and all x-oss-* headers,
    // or else the server side cannot calculate the signature from the bottom up and get the same result.
    // the document does not say all other headers need to be included in additional header list,
    // for now I include all other headers in the header list provided to fetch option,
    // but the fetch implementation default will add some default headers, like host, ua, accept, etc.
    // so I think you are kind of free to pick additional headers, and use a more precise pick strategy
    // is not meaningful, so keep current strategy
    headers.sort_by(|(q1, _), (q2, _)| q1.to_ascii_lowercase().cmp(&q2.to_ascii_lowercase()));
    let mut canonical_headers = String::new();
    let mut additional_header_names = String::new();
    for &(key, value) in &headers {
        let key = key.trim().to_ascii_lowercase();
        // NOTE no whitespace around colon
        // ATTENTION map(+\n).join(), not map().join(\n), headers part always have an empty line to mark ending
        write!(&mut canonical_headers, "{}:{}\n", key, value.trim())?;

        if key != "content-type" && key != "content-md5" && !key.starts_with("x-oss-") {
            additional_header_names.push_str(&key);
            additional_header_names.push(';');
        }
    }
    if !additional_header_names.is_empty() { additional_header_names.pop(); }

    let canonical_request = format!(
        "{}\n{}\n{}\n{}\n{}\nUNSIGNED-PAYLOAD",
        method.as_str(),
        canonical_uri,
        // don't exclude query even when it is empty
        canonical_query,
        canonical_headers,
        additional_header_names,
        // // the last part is called hashed payload or x-oss-content-sha256 in official code
        // // I guess they want to hash content but that's not ok for large files, but still keep the field for dreaming
        // "UNSIGNED-PAYLOAD"
    );
    trace!("canonical request: {}", canonical_request);

    let date_string = time.format("%Y%m%d").to_string();
    let string_to_sign = format!(
        "OSS4-HMAC-SHA256\n{}\n{}/{}/oss/aliyun_v4_request\n{}",
        // document say iso8601,
        // official code call it timestamp?, and format is YYYYMMDDThhmmssZ?, the format in official code is here if you don't find
        // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.ts#L43
        time_rfc3339,
        // the date and time part confusingly appear 2 times continuously
        date_string,
        config.region,
        { let mut hasher = Sha256::new(); hasher.update(canonical_request.as_bytes()); hex::encode(hasher.finalize()) },
    );
    trace!("string to sign: {}", string_to_sign);

    // what is using previous step hash result as next step key
    macro_rules! sign { ($key:expr, $data:expr) => {{
        let mut hmac = Hmac::<Sha256>::new_from_slice($key)?;
        hmac.update($data);
        hmac.finalize().into_bytes().to_vec()
    }} }
    let secret = format!("aliyun_v4{}", config.access_key_secret);
    let signature1 = sign!(secret.as_bytes(), date_string.as_bytes());
    let signature2 = sign!(&signature1, config.region.as_bytes());
    let signature3 = sign!(&signature2, b"oss");
    let signature4 = sign!(&signature3, b"aliyun_v4_request");
    // string to sign is here if you lost track
    let signature5 = hex::encode(sign!(&signature4, string_to_sign.as_bytes()));

    let authorization = format!(
        "OSS4-HMAC-SHA256 Credential={}/{}/{}/oss/aliyun_v4_request{},Signature={}",
        config.access_key_id,
        time.format("%Y%m%d"),
        config.region,
        if additional_header_names.is_empty() { String::new() } else { format!(",AdditionalHeaders={}", additional_header_names) },
        signature5,
    );
    trace!("authorization: {}", authorization);
    headers.push(("authorization", &authorization));
    // trace!(headers);

    let url = format!(
        "https://{}.oss-{}{}.aliyuncs.com{}",
        config.bucket, config.region, if config.internal { "-internal" } else { "" },
        if let Some(object_name) = &object_name { format!("/{}", object_name) } else { String::new() });
    trace!("url: {}", url);

    let mut request = client.request(method, url);
    request = request.query(&queries);
    // this is not ok for consuming builder pattern, if you try
    // headers.into_iter().for_each(|(k, v)| request = request.header(k, v));
    for (k, v) in headers { request = request.header(k, v); }
    if let Some((body, _)) = body { request = request.body(body); }
    // done making the request object
    // note this function only makes request object but not send, avoid async here should be beneficial
    Ok(request.build()?)
}

#[derive(Deserialize, Debug)]
struct ErrorResponse {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Message")]
    message: Option<String>,
}

#[derive(Deserialize)]
struct ListResponse {
    #[serde(rename = "NextContinuationToken")]
    next_continuation_token: Option<String>,
    #[serde(rename = "Contents", skip_serializing_if = "Vec::is_empty", default)]
    contents: Vec<ListResponseContent>,
}
#[derive(Deserialize)]
struct ListResponseContent {
    #[serde(rename = "Key")]
    name: String,
    #[serde(rename = "LastModified")]
    mtime: String,
    #[serde(rename = "Size")]
    size: usize,
}

async fn handle_list_command(config: &Config, command: &ListCommand) -> Result<()> {
    info!("list objects");
    // https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2

    let time = Utc::now();
    let client = Client::new();

    let mut loop_count = 0;
    let mut continuation_token: Option<String> = None;
    let mut all_files = Vec::new();
    loop {
        // now that queries is consumed by make request,
        // it is actually more clear to create queries every time
        let mut queries = Vec::new();
        // api version
        queries.push(("list-type", "2"));
        if let Some(start_after) = &command.start_after { queries.push(("start-after", start_after)); }
        if let Some(prefix) = &command.prefix { queries.push(("prefix", prefix)); }
        // max-keys: note that may return less than count keys even there are more records
        let count_string: String; // this is how you extend lifetime of .to_string()
        if let Some(count) = &command.count {
            count_string = count.to_string();
            queries.push(("max-keys", &count_string))
        }
        if let Some(continuation_token) = continuation_token.as_deref() {
            queries.push(("continuation-token", continuation_token));
        }
        // delimeter: what's the document talking about? this is not simple filter prefix and group by?
        // fetch-owner: not used

        let request = make_request(config, &client, time,
            Method::GET, /* object */ None, queries, /* headers */ Vec::new(), /* body */ None)?;
        let response = client.execute(request).await?; // <-- send is here
    
        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }

        // by the way, nowadays nodejs fetch and rust reqwest both provides
        // convenient functions like response.text() and response.json(), but not for xml
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        if status.is_success() {
            let response: ListResponse = serde_xml_rs::from_str(&response_body)?;
            all_files.extend(response.contents);
            if !command.r#continue || response.next_continuation_token.is_none() {
                break;
            }
            continuation_token = response.next_continuation_token;
        } else {
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("error {}: {:?}", response.code, response.message));
        }

        loop_count += 1;
        if loop_count > 100 {
            return Err(anyhow!("you called api 100 times?"));
        }
    }

    for file in all_files {
        println!("{} {} {}", file.name, file.size, file.mtime);
    }
    info!("list success");
    Ok(())
}
async fn handle_upload_command(config: &Config, command: &UploadCommand) -> Result<()> {
    info!("upload {} {:?}", command.filename, command.object_name);
    // https://help.aliyun.com/zh/oss/developer-reference/putobject

    let time = Utc::now();
    let client = Client::new();

    let mut headers = Vec::new();
    if command.forbid_overwrite { headers.push(("x-oss-forbid-overwrite", "true")); }
    // 'cache-control': this is cache control when downloading, not used in this project
    // 'content-disposition': this is download behavior, too
    // 'content-encoding': no need to compress again, so leave it identity
    // 'content-md5': don't use md5
    // 'expires': no expires
    // 'x-oss-forbid-overwrite': good to avoid accidentally upload again
    // 'x-oss-server-side-encryption'
    // 'x-oss-server-side-data-encryption'
    // 'x-oss-server-side-encryption-key-id': do not use server side encryption
    // 'x-oss-object-acl': default should be enough
    // 'x-oss-storage-class': use standard for now
    // 'x-oss-meta-*'
    // 'x-oss-tagging': no metadata needed for now
    // 'x-oss-object-worm-mode'
    // 'x-oss-object-worm-retain-util-date': what is worm?

    let file = File::open(&command.filename).await?;
    let metadata = file.metadata().await?;
    let object_name = command.object_name.as_deref().or(Some(&command.filename));
    let request = make_request(config, &client, time,
        Method::PUT, object_name, /* queries */ Vec::new(), headers, Some((file.into(), metadata.len() as usize)))?;
    let response = client.execute(request).await?; // <-- send is here

    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }
    if status.is_success() {
        println!("download {:?} from {} complete", object_name, command.filename);
    } else {
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
        return Err(anyhow!("error {}: {:?}", response.code, response.message));
    }
    Ok(())
}
async fn handle_download_command(config: &Config, command: &DownloadCommand) -> Result<()> {
    info!("download {} {:?}", command.filename, command.object_name);
    // https://help.aliyun.com/zh/oss/developer-reference/getobject

    let time = Utc::now();
    let client = Client::new();

    let queries = Vec::new();
        // 'response-content-language'
        // 'response-expires'
        // 'response-cache-control'
        // 'response-content-disposition'
        // 'response-content-encoding': set response header by set url params?
    let headers = Vec::new();
        // 'range': http standard range
        // 'x-oss-multi-range-behavior': set to 'multi-range' to allow multi range
        // 'if-modified-since'
        // 'if-unmodified-since'
        // 'if-match'
        // 'if-non-match': standard cache control headers
    
    let object_name = command.object_name.as_deref().or(Some(&command.filename));
    let request = make_request(config, &client, time, Method::GET, object_name, queries, headers, None)?;
    let mut response = client.execute(request).await?; // <-- send is here

    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }

    if status.is_success() {
        let mut file = File::create(&command.filename).await?;
        while let Some(chunk) = response.chunk().await? {
            trace!("received {} bytes in chunk", chunk.len());
            file.write_all(&chunk).await?;
        }
        println!("download {} from {:?} complete", command.filename, object_name);
    } else {
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
        return Err(anyhow!("error {}: {:?}", response.code, response.message));
    }
    Ok(())
}
async fn handle_remove_command(config: &Config, command: &RemoveCommand) -> Result<()> {
    info!("remove {}", command.object_name);
    // https://help.aliyun.com/zh/oss/developer-reference/deleteobject

    let time = Utc::now();
    let client = Client::new();

    let queries = Vec::new();
        // 'versionId': not use version control

    let request = make_request(config, &client, time,
        Method::DELETE, Some(&command.object_name), queries, /* headers */ Vec::new(), None)?;
    let response = client.execute(request).await?; // <-- send is here

    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }
    if status.is_success() {
        println!("remove {} complete (NOTE there is no error for previously not exist file)", command.object_name);
    } else {
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
        return Err(anyhow!("error {}: {:?}", response.code, response.message));
    }
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let command = Command::parse();
    let config_original_content = read_to_string(&command.config_path).await?;
    let config: Config = toml::from_str(&config_original_content)?;

    match &command.kind {
        CommandKind::List(command) => handle_list_command(&config, command).await?,
        CommandKind::Upload(command) => handle_upload_command(&config, command).await?,
        CommandKind::Download(command) => handle_download_command(&config, command).await?,
        CommandKind::Remove(command) => handle_remove_command(&config, command).await?,
    }
    Ok(())
}

// docker run -it --rm --name alioss1 -v .:/work -v ~/cargo-build-cache-alioss:/work/target -v ~/cargo-download-cache:/usr/local/cargo/registry -h RUST -w /work my/rust:1
// need this if dependencies need build: apk add musl-dev
// TODO remove unnecessary features and optimize binary size
