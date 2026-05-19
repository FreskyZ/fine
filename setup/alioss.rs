use std::borrow::Cow;
use std::path::PathBuf;
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand, Args};
use hmac::{Hmac, Mac, KeyInit};
use log::{trace, info};
use reqwest::{Client, Request, Method};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{fs::{self, File}, io::AsyncWriteExt};

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

// encodeURIComponent:
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
fn push_percent_encoded(builder: &mut String, data: &str, skip: impl Fn(char) -> bool) {
    static TABLE: &str = "\
        %00%01%02%03%04%05%06%07%08%09%0A%0B%0C%0D%0E%0F\
        %10%11%12%13%14%15%16%17%18%19%1A%1B%1C%1D%1E%1F\
        %20%21%22%23%24%25%26%27%28%29%2A%2B%2C%2D%2E%2F\
        %30%31%32%33%34%35%36%37%38%39%3A%3B%3C%3D%3E%3F\
        %40%41%42%43%44%45%46%47%48%49%4A%4B%4C%4D%4E%4F\
        %50%51%52%53%54%55%56%57%58%59%5A%5B%5C%5D%5E%5F\
        %60%61%62%63%64%65%66%67%68%69%6A%6B%6C%6D%6E%6F\
        %70%71%72%73%74%75%76%77%78%79%7A%7B%7C%7D%7E%7F\
        %80%81%82%83%84%85%86%87%88%89%8A%8B%8C%8D%8E%8F\
        %90%91%92%93%94%95%96%97%98%99%9A%9B%9C%9D%9E%9F\
        %A0%A1%A2%A3%A4%A5%A6%A7%A8%A9%AA%AB%AC%AD%AE%AF\
        %B0%B1%B2%B3%B4%B5%B6%B7%B8%B9%BA%BB%BC%BD%BE%BF\
        %C0%C1%C2%C3%C4%C5%C6%C7%C8%C9%CA%CB%CC%CD%CE%CF\
        %D0%D1%D2%D3%D4%D5%D6%D7%D8%D9%DA%DB%DC%DD%DE%DF\
        %E0%E1%E2%E3%E4%E5%E6%E7%E8%E9%EA%EB%EC%ED%EE%EF\
        %F0%F1%F2%F3%F4%F5%F6%F7%F8%F9%FA%FB%FC%FD%FE%FF\
    ";
    assert!(data.is_ascii());
    for &b in data.as_bytes() {
        if skip(b as char) {
            builder.push(b as char);
        } else {
            builder.push_str(&TABLE[b as usize * 3..b as usize * 3 + 3]);
        }
    }
}

// you cannot easily use RequestBuilder or Request for operations in this script
// so the answer is make request from custom request properties
fn build_request(
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

    let date_string = time.format("%Y%m%d").to_string();
    let time_string = time.format("%Y%m%dT%H%M%SZ").to_string();

    // // now that I have consumed headers vec but
    // // borrow checker still think adding reference to variables in this scope is not live long enough,
    // // so the correct answer is
    // // ? you have no way to explicitly specify a vec with reference with lifetime of current function
    // // a not-affecting-following-part solution look like this
    // let dummy_element = String::new();
    // let mut dummy_headers = Vec::new();
    // dummy_headers.push((dummy_element.as_str(), dummy_element.as_str()));
    // headers.into_iter().for_each(|(k, v)| dummy_headers.push((k, v)));
    // let mut headers = Vec::new();
    // dummy_headers.into_iter().skip(1).for_each(|(k, v)| headers.push((k, v)));
    // // but actually there is unconditionally inserted values, so use them is better
    
    let mut new_headers = Vec::new(); // (key, value, key_lower as Cow)
    // this does not work
    // headers['accept'] = 'application/json,*/*';
    // this is not in api reference and example, but seems required according to document and official code
    // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.js#L34
    new_headers.push(("x-oss-content-sha256", "UNSIGNED-PAYLOAD"));
    // this is not in api reference and example, but seems required according to document and official code
    // this will raise error if you give fractions of seconds
    new_headers.push(("x-oss-date", time_string.as_str()));

    let body_size_string: String; // this is how you extend lifetime of number.to_string()
    if let Some((_, size)) = &body {
        body_size_string = size.to_string();
        new_headers.push(("content-type", "application/octet-stream"));
        new_headers.push(("content-length", body_size_string.as_str()));
    }

    let mut headers = new_headers.into_iter().chain(headers).map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
        Cow::Borrowed(k)
    } else {
        Cow::Owned(k.to_ascii_lowercase())
    })).collect::<Vec<_>>();
    // required by later signing process
    headers.sort_by(|(_, _, h1), (_, _, h2)| h1.cmp(&h2));

    let mut queries = queries.into_iter().map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
        Cow::Borrowed(k)
    } else {
        Cow::Owned(k.to_ascii_lowercase())
    })).collect::<Vec<_>>();
    // also for queries by the way
    queries.sort_by(|(_, _, h1), (_, _, h2)| h1.cmp(&h2));

    let mut builder = String::new(); // canonical request builder
    builder.push_str(method.as_str());
    builder.push('\n');

    // canonical uri: /bucketname/objectname, or /bucketname/ for bucket level operations that don't have an object name
    builder.push('/');
    // the official code use a custom encodeString implementation that include this
    // encodeURIComponent(tempStr).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    // see https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/signUtils.js#L154
    push_percent_encoded(&mut builder, &config.bucket, is_filename_character);
    if let Some(object_name) = object_name {
        for segment in object_name.split('/') {
            builder.push('/');
            push_percent_encoded(&mut builder, segment, is_filename_character);
        }
    } else {
        builder.push('/'); // will raise error if this is missing
    }
    builder.push('\n');

    // canonical query
    // document does not say whether sort happen after lowercase,
    // official code sort after lowercase and sign according to lowercase but seems not use lowercase in actual request,
    // follow this pattern as it works for long time
    for (_, value, key_lower) in &queries {
        push_percent_encoded(&mut builder, &*key_lower, is_uri_component_character);
        builder.push('=');
        push_percent_encoded(&mut builder, *value, is_uri_component_character);
        builder.push('&')
    }
    if !queries.is_empty() { builder.pop(); }
    builder.push('\n');

    // canonical headers
    // must include headers: x-oss-content-sha256
    // must include headers if exist: content-type, content-md5 and x-oss-*
    // include additional headers:
    //   the signing algorithm need you to delcare additional headers used in the calculation process,
    //   except required headers, required headers are content-type, content-md5 and all x-oss-* headers,
    //   or else the server side cannot calculate the signature from the bottom up and get the same result.
    //   the document does not say all other headers need to be included in additional header list,
    //   for now I include all other headers in the header list provided to fetch option,
    //   but the fetch implementation default will add some default headers, like host, ua, accept, etc.
    //   so I think you are kind of free to pick additional headers, and use a more precise pick strategy
    //   is not meaningful, so keep current strategy
    let mut additional_header_names = String::new(); // this have to be a standalone builder
    for (_, value, key_lower) in &headers {
        builder.push_str(&*key_lower);
        builder.push(':'); // NOTE no whitespace around colon
        builder.push_str(*value);
        // ATTENTION map(+\n).join(), not map().join(\n), headers part always have an empty line to mark ending
        builder.push('\n');
        if key_lower != "content-type" && key_lower != "content-md5" && !key_lower.starts_with("x-oss-") {
            additional_header_names.push_str(&*key_lower);
            additional_header_names.push(';');
        }
    }
    builder.push('\n');
    if !additional_header_names.is_empty() { additional_header_names.pop(); }
    builder.push_str(&additional_header_names);
    builder.push('\n');

    // // the last part is called hashed payload or x-oss-content-sha256 in official code
    // // I guess they want to hash content but that's not ok for large files, but still keep the field for dreaming
    builder.push_str("UNSIGNED-PAYLOAD");

    let canonical_request = builder;
    trace!("canonical request: {}", canonical_request);

    let mut builder = String::with_capacity(180); // string to sign builder
    builder.push_str("OSS4-HMAC-SHA256\n"); // fixed length 17
    // document say iso8601,
    // official code call it timestamp?, and format is YYYYMMDDThhmmssZ?, the format in official code is here if you don't find
    // https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/utils/createRequest.ts#L43
    builder.push_str(&time_string); // fixed length 16
    builder.push('\n');
    // the date and time part confusingly appear 2 times continuously
    builder.push_str(&date_string); // fixed length 8
    builder.push('/');
    builder.push_str(&config.region); // approximately 10
    builder.push_str("/oss/aliyun_v4_request\n"); // fixed length 23
    let mut canonical_request_hasher = Sha256::new();
    canonical_request_hasher.update(canonical_request.as_bytes());
    builder.push_str(&hex::encode(canonical_request_hasher.finalize())); // fixed length 64

    let string_to_sign = builder;
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
    let signature5 = hex::encode(sign!(&signature4, string_to_sign.as_bytes())); // <-- string to sign is here if you lost track

    let mut builder = String::new(); // authorization header builder
    builder.push_str("OSS4-HMAC-SHA256 Credential=");
    builder.push_str(&config.access_key_id);
    builder.push('/');
    // this part is same as in string to sign
    builder.push_str(&date_string);
    builder.push('/');
    builder.push_str(&config.region);
    builder.push_str("/oss/aliyun_v4_request");
    if !additional_header_names.is_empty() {
        // // ok this part is after a fixed part that not depend on previous sections,
        // // so you can build additional header names here, but that's too cursed and mess everything up, so don't do that
        builder.push_str(",AdditionalHeaders=");
        builder.push_str(&additional_header_names);
    }
    builder.push_str(",Signature=");
    builder.push_str(&signature5); // <-- signature 5 is here if you lost track

    let authorization_value = builder;
    trace!("authorization: {}", authorization_value);
    headers.push(("authorization", &authorization_value, Cow::Borrowed("authorizataion")));
    // trace!(headers);

    let url = format!(
        "https://{}.oss-{}{}.aliyuncs.com{}",
        config.bucket, config.region, if config.internal { "-internal" } else { "" },
        if let Some(object_name) = &object_name { format!("/{}", object_name) } else { String::new() });
    trace!("url: {}", url);

    let mut builder = client.request(method, url); // request builder is also builder
    let queries = queries.into_iter().map(|(k, v, _)| (k, v)).collect::<Vec<_>>();
    builder = builder.query(&queries);
    // this is not ok for consuming builder pattern, if you try
    // headers.into_iter().for_each(|(k, v)| builder = builder.header(k, v));
    trace!("headers {:?}", headers);
    for (k, v, _) in headers { builder = builder.header(k, v); }
    if let Some((body, _)) = body { builder = builder.body(body); }
    // done making the request object
    // cannot directly return builder.build because error type mismatch,
    // note this function only makes request object but not send, avoid async here should be beneficial
    Ok(builder.build()?)
}

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
    #[command(about = "sync to this machine")]
    Sync(SyncCommand),
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
#[derive(Args)]
struct SyncCommand {
    #[arg(short, long, env = "OSS_LOCAL_DIR", help = "local copy directory")]
    directory: String,
    #[arg(short, long, help = "filter by starts with")]
    prefix: Option<String>,
    #[arg(
        short,
        long,
        value_name = "STRIP",
        help = "strip prefix from file names, require prefix.starts_with(strip-prefix)"
    )]
    strip_prefix: Option<String>,
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
#[derive(Deserialize, Debug)]
struct ListResponseContent {
    #[serde(rename = "Key")]
    name: String,
    #[serde(rename = "LastModified")]
    mtime: String,
    #[serde(rename = "Size")]
    size: usize,
}

async fn handle_list(config: &Config, command: &ListCommand, client: &Client, time: DateTime<Utc>) -> Result<Vec<ListResponseContent>> {
    // https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2
    let mut loop_count = 0;
    let mut continuation_token: Option<String> = None;
    let mut all_files = Vec::new();
    loop {
        // now that queries is consumed by make request,
        // it is actually more clear to create queries every time
        let mut queries = Vec::new();
        // api version
        queries.push(("list-type", "2"));
        // according to current implementation,
        // start-after and prefix have to be ascii, which is ok for this project
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

        let request = build_request(config, &client, time,
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
    Ok(all_files)
}

async fn handle_list_command(config: &Config, command: &ListCommand) -> Result<()> {
    info!("list objects");
    let time = Utc::now();
    let client = Client::new();
    let all_files = handle_list(config, command, &client, time).await?;
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
    let request = build_request(config, &client, time,
        Method::PUT, object_name, /* queries */ Vec::new(), headers, Some((file.into(), metadata.len() as usize)))?;
    let response = client.execute(request).await?; // <-- send is here

    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }
    if status.is_success() {
        println!("upload {:?} from {} complete", object_name, command.filename);
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
    let request = build_request(config, &client, time, Method::GET, object_name, queries, headers, None)?;
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

    let request = build_request(config, &client, time,
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

async fn handle_sync_command(config: &Config, command: &SyncCommand) -> Result<()> {
    info!("sync to {}", command.directory);

    if std::env::var_os("OSS_LOCAL_DIR").is_some() {
        println!("use sync local directory {}", command.directory);
    }

    let metadata = fs::metadata(&command.directory).await?;
    if !metadata.is_dir() {
        return Err(anyhow!("target {} is not a directory", command.directory));
    }
    let mut read_dir = fs::read_dir(&command.directory).await?;
    let mut local_files = Vec::new(); // OsString[]
    while let Some(entry) = read_dir.next_entry().await? {
        local_files.push(entry.file_name());
    }
    
    match (&command.prefix, &command.strip_prefix) {
        (Some(prefix), Some(strip_prefix)) if !prefix.starts_with(strip_prefix) =>
            return Err(anyhow!("strip-prefix should be same or beginning part of prefix")),
        (None, Some(_)) =>
            return Err(anyhow!("strip-prefix should be same or beginning part of prefix")),
        _ => {},
    }
    let time = Utc::now();
    let client = Client::new();
    let list_command = ListCommand{
        count: None,
        start_after: None,
        prefix: command.prefix.clone(),
        r#continue: true,
    };
    let remote_files = handle_list(config, &list_command, &client, time).await?;

    // exist in remote but not exist in local,
    // note that local can have more files than remote, don't remove local file
    let missing_files = remote_files.into_iter()
        .filter(|r| !local_files.iter().any(|l| **l == *r.name)).collect::<Vec<_>>();
    if missing_files.is_empty() { println!("up to date"); return Ok(()); }
    trace!("missing files: {:?}", missing_files);

    let tasks = missing_files.into_iter().map(async |object| {
        let queries = Vec::new();
        let headers = Vec::new();
        let request = build_request(config, &client, time,
            Method::GET, /* object name */ Some(&object.name), queries, headers, /* body */ None)?;
        let mut response = client.execute(request).await?; // client is Send + Sync
        
        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }

        if status.is_success() {
            let filename = if let Some(strip_prefix) = &command.strip_prefix {
                object.name.strip_prefix(strip_prefix)
                    .ok_or_else(|| anyhow!("cannot strip prefix after use prefix?"))?
            } else {
                object.name.as_str()
            };
            let mut filepath = PathBuf::from(&command.directory);
            filepath.push(filename);
            let mut file = File::create(&filepath).await?;
            while let Some(chunk) = response.chunk().await? {
                trace!("received {} bytes in chunk", chunk.len());
                file.write_all(&chunk).await?;
            }
            return Ok(if filename == object.name {
                format!("download {} success", object.name)
            } else {
                format!("download {} to {} success", object.name, filename)
            });
        } else {
            let response_body = response.text().await?;
            trace!("response body {}", response_body);
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("failed to download {} {}: {:?}", object.name, response.code, response.message));
        }
    });
    let task_results = futures::future::join_all(tasks).await;

    let mut has_error = false;
    for result in task_results {
        match result {
            Ok(result) => println!("{}", result),
            Err(error) => { has_error = true; println!("{}", error); },
        }
    }
    if has_error { Err(anyhow!("failed to run some tasks")) } else { Ok(()) }
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let command = Command::parse();
    if std::env::var_os("OSS_CONFIG").is_some() {
        println!("use config path {}", command.config_path);
    }
    let config_original_content = fs::read_to_string(&command.config_path).await?;
    let config: Config = toml::from_str(&config_original_content)?;

    match &command.kind {
        CommandKind::List(command) => handle_list_command(&config, command).await?,
        CommandKind::Upload(command) => handle_upload_command(&config, command).await?,
        CommandKind::Download(command) => handle_download_command(&config, command).await?,
        CommandKind::Remove(command) => handle_remove_command(&config, command).await?,
        CommandKind::Sync(command) => handle_sync_command(&config, command).await?,
    }
    Ok(())
}

// docker run -it --rm --name alioss1 -v .:/work -v ~/cargo-build-cache-alioss:/work/target -v ~/cargo-download-cache:/usr/local/cargo/registry -h RUST -w /work my/rust:1
// need this if dependencies need build: apk add musl-dev
