use std::borrow::Cow;
use std::path::{Path, PathBuf, Component};
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand, Args, ValueEnum};
use hmac::{Hmac, Mac, KeyInit};
use log::{trace, info};
use reqwest::{Client, Request, Response, Method};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use tokio::{fs::{self, File}, io::{AsyncReadExt, AsyncWriteExt, AsyncSeekExt}};

#[derive(Deserialize)]
struct Config {
    region: String,
    internal: bool,
    bucket: String,
    #[serde(rename = "access-key-id")]
    access_key_id: String,
    #[serde(rename = "access-key-secret")]
    access_key_secret: String,
    // include a current time in config as it is *frequently* used in build_request
    // - will not be in real config file
    // - effectively reduce parameter count in the (config, client, time) command pattern
    // - reasonable to add to commands but low level functions do not use cli commands,
    //   if they are added in future, assign to this structure to avoid add parameter back
    #[serde(skip, default = "Utc::now")]
    time: DateTime<Utc>,
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
fn push_percent_encoded(builder: &mut String, data: &[u8], skip: impl Fn(char) -> bool) {
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
    // TODO now that parameter is path segment OsStr, does this work for all kind of characters?
    for &b in data {
        if skip(b as char) {
            builder.push(b as char);
        } else {
            builder.push_str(&TABLE[b as usize * 3..b as usize * 3 + 3]);
        }
    }
}

// reqwest RequestBuilder and Request is not easy to use for operations
// in this script, so the result is make Reqeust from custom request properties
fn build_request(
    config: &Config,
    client: &Client,
    method: Method,
    // should be root path, may be omit for bucket level operations
    object_path: Option<&Path>,
    // key lifetime is likely static, value lifetime is likely static or same as command
    // take ownership of vec
    queries: Vec<(&str, &str)>,
    // - key lifetime is likely static, value lifetime is likely static or same as command
    // - take ownership of vec
    // - cannot use reqwest::HeaderMap because that order is arbitrary
    // - this function will add content-length, content-type, x-oss-date, x-oss-content-sha256
    headers: Vec<(&str, &str)>,
    // body and size,
    // if you impl Into<Body> here, binary size will explode (not likely, libcrypto is too large)
    body: Option<(reqwest::Body, usize)>,
) -> Result<Request> {
    // official sdk source code https://github.com/ali-sdk/ali-oss/blob/master/lib/common/signUtils.js
    // signature document https://help.aliyun.com/zh/oss/developer-reference/recommend-to-use-signature-version-4
    // NOTE don't read the graph or image in the document, it contains incorrect information, read the detail tables

    // time is used 4??!! times in request signing process,
    // use the same time for these usages, not sure what will happen if one or some are different
    // UPDATE: ai indicates me can set mtime and check mtime in sync, but official code is also using the
    //   same value for the all 4 usages, and try set them to some ancient time will raise error, so this
    //   actually not support arbitrary custom time (but can set to a very recent time, like minutes, to
    //   diagnose issues in this function, although this function nearly never have issue after completed)
    let date_string = config.time.format("%Y%m%d").to_string();
    let time_string = config.time.format("%Y%m%dT%H%M%SZ").to_string();

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

    let mut headers = new_headers.into_iter()
        .chain(headers)
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
            Cow::Borrowed(k)
        } else {
            Cow::Owned(k.to_ascii_lowercase())
        })).collect::<Vec<_>>();
    // required by later signing process
    headers.sort_by(|(_, _, h1), (_, _, h2)| h1.cmp(h2));

    let mut queries = queries.into_iter()
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
            Cow::Borrowed(k)
        } else {
            Cow::Owned(k.to_ascii_lowercase())
        })).collect::<Vec<_>>();
    // also for queries by the way
    queries.sort_by(|(_, _, h1), (_, _, h2)| h1.cmp(h2));

    let mut builder = String::new(); // canonical request builder
    builder.push_str(method.as_str());
    builder.push('\n');

    // canonical uri: /bucketname/objectname, or /bucketname/ for bucket level operations that don't have an object name
    builder.push('/');
    // the official code use a custom encodeString implementation that include this
    // encodeURIComponent(tempStr).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    // see https://github.com/ali-sdk/ali-oss/blob/fa263d22ca4c6599cb987c3db6325c86c7a5dc6b/lib/common/signUtils.js#L154
    push_percent_encoded(&mut builder, config.bucket.as_bytes(), is_filename_character);
    if let Some(object_path) = object_path {
        if object_path.is_relative() {
            bail!("object path should be absolute: {}", object_path.display());
        }
        for component in object_path.components() {
            match component {
                Component::Prefix(_) => bail!("you write a windows path prefix here?"),
                Component::CurDir => bail!("do not use current dir (.) in object path: {}", object_path.display()),
                Component::ParentDir => bail!("do not use parent dir (..) in object path: {}", object_path.display()),
                Component::RootDir => {}, // expected, nothing to do
                Component::Normal(segment) => {
                    builder.push('/');
                    push_percent_encoded(&mut builder, segment.as_encoded_bytes(), is_filename_character);
                },
            }
        }
    } else {
        builder.push('/'); // will raise error if this is missing for bucket level operations
    }
    builder.push('\n');

    // canonical query
    // document does not say whether sort happen after lowercase,
    // official code sort after lowercase and sign according to lowercase but seems not use lowercase in actual request,
    // follow this pattern as it works for long time
    for (_, value, key_lower) in &queries {
        push_percent_encoded(&mut builder, key_lower.as_bytes(), is_uri_component_character);
        builder.push('=');
        push_percent_encoded(&mut builder, value.as_bytes(), is_uri_component_character);
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
        builder.push_str(key_lower);
        builder.push(':'); // NOTE no whitespace around colon
        builder.push_str(value);
        // ATTENTION map(+\n).join(), not map().join(\n), headers part always have an empty line to mark ending
        builder.push('\n');
        if key_lower != "content-type" && key_lower != "content-md5" && !key_lower.starts_with("x-oss-") {
            additional_header_names.push_str(key_lower);
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

    let mut builder = String::new(); // url builder
    builder.push_str("https://");
    builder.push_str(&config.bucket);
    builder.push_str(".oss-");
    builder.push_str(&config.region);
    if config.internal {
        builder.push_str("-internal");
    }
    builder.push_str(".aliyuncs.com");
    if let Some(object_path) = object_path {
        builder.push_str(object_path.to_str()
            .unwrap_or("how-do-you-make-an-invalid-utf8-object-path"));
    }
    let url = builder;
    trace!("url: {}", url);

    let mut builder = client.request(method, url); // request builder is also builder
    let queries = queries.into_iter().map(|(k, v, _)| (k, v)).collect::<Vec<_>>();
    trace!("request queries {:?}", queries);
    builder = builder.query(&queries);
    // this is not ok for consuming builder pattern, if you try
    // headers.into_iter().for_each(|(k, v)| builder = builder.header(k, v));
    trace!("request headers? {:?}", headers);
    for (k, v, _) in headers { builder = builder.header(k, v); }
    if let Some((body, _)) = body { builder = builder.body(body); }
    // done making the request object
    // cannot directly return builder.build because error type mismatch,
    // note this function only makes request object but not send, avoid async here should be beneficial
    Ok(builder.build()?)
}

#[derive(Deserialize, Debug)]
struct ErrorResponse {
    #[serde(rename = "Code")]
    code: String,
    #[serde(rename = "Message")]
    message: Option<String>,
}

// common pattern send request, trace status, headers and handle error response
// returned response must be 2xx after question mark
async fn send_request(client: &Client, request: Request) -> Result<Response> {
    let response = client.execute(request).await?;
    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }
    if status.is_success() {
        Ok(response)
    } else { 
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        // // by the way, nowadays nodejs fetch and rust reqwest both provides
        // // several convenient functions like response.text() and response.json(),
        // // but all of them don't expect somewhere still keeps using xml
        let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
        Err(anyhow!("error {}: {:?}", response.code, response.message))
    }
}

struct ListOptions<'a> {
    count: Option<usize>,
    start_after: Option<&'a str>,
    prefix: Option<&'a str>,
    r#continue: bool,
    max_page_count: usize,
}
#[derive(Deserialize, Debug)]
struct ListResponseObject {
    #[serde(rename = "Key")]
    path: PathBuf,
    #[serde(rename = "Size")]
    size: usize,
    // although called mtime, cannot set to arbitrary time
    // according to fs metadata, so this should be called upload time
    #[serde(rename = "LastModified")]
    upload_time: String,
}
#[derive(Deserialize)]
struct ListResponse {
    #[serde(rename = "NextContinuationToken")]
    next_continuation_token: Option<String>,
    #[serde(rename = "Contents", skip_serializing_if = "Vec::is_empty", default)]
    contents: Vec<ListResponseObject>,
}
async fn list_objects(config: &Config, client: &Client, options: ListOptions<'_>) -> Result<Vec<ListResponseObject>> {

    // https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2
    let mut loop_count = 0;
    let mut all_objects = Vec::new();
    let mut continuation_token: Option<String> = None;
    loop {
        // now that queries is consumed by make request,
        // it is actually more clear to create queries every time
        let mut queries = Vec::new();
        // api version
        queries.push(("list-type", "2"));
        // according to current implementation in build_request,
        // start-after and prefix have to be ascii, which is ok for this project
        if let Some(start_after) = options.start_after {
            queries.push(("start-after", start_after));
        }
        if let Some(prefix) = options.prefix {
            queries.push(("prefix", prefix));
        }
        // max-keys: note that may return less than count keys even there are more records
        let count_string: String; // this is how you extend lifetime of .to_string()
        if let Some(count) = options.count {
            count_string = count.to_string();
            queries.push(("max-keys", &count_string))
        }
        if let Some(continuation_token) = continuation_token.as_deref() {
            queries.push(("continuation-token", continuation_token));
        }
        // delimeter: what's the document talking about? this is not simple filter prefix and group by?
        // fetch-owner: not used

        let request = build_request(config, client, Method::GET,
            /* object */ None, queries, /* headers */ Vec::new(), /* body */ None)?;
        let response = send_request(client, request).await?;
    
        let response = response.text().await?;
        // trace!("response body {}", response_body); // this is making trace log hard to read
        let response: ListResponse = serde_xml_rs::from_str(&response)?;

        all_objects.extend(response.contents.into_iter().map(|object| ListResponseObject {
            path: PathBuf::from("/").join(object.path),
            size: object.size,
            upload_time: object.upload_time,
        }));
        if !options.r#continue || response.next_continuation_token.is_none() { break; }
        continuation_token = response.next_continuation_token;

        loop_count += 1;
        if loop_count > options.max_page_count {
            bail!("page count exceeds configured limit {}", options.max_page_count);
        }
    }
    Ok(all_objects)
}

enum UploadChecksumOption {
    None,
    // TODO Calculate(&some_kind_of_object_pool::Pool)
    // do not use Calculate(&'a mut Vec<u8>), that's horrific
    Calculate,
    Provided(String),
}
struct UploadOptions<'a> {
    file_path: &'a Path,
    object_path: &'a Path,
    forbid_overwrite: bool,
    // if size is previously acquired, use this to reduce one syscall
    // use 0 to indicate not provided, if size is previously acquired and is 0, should not upload
    provided_size: usize,
    // if hash is previously calculated, use that
    checksum: UploadChecksumOption,
}
pub const OBJECT_META_HASH: &str = "x-oss-meta-hash";

async fn upload_object(config: &Config, client: &Client, options: UploadOptions<'_>) -> Result<()> {

    // https://help.aliyun.com/zh/oss/developer-reference/putobject
    let mut headers = Vec::new();
    // 'cache-control': this is cache control when downloading, not used in this project
    // 'content-disposition': this is download behavior, too
    // 'content-encoding': no need to compress again, so leave it identity
    // 'content-md5': don't use md5
    // 'expires': no expires
    if options.forbid_overwrite { headers.push(("x-oss-forbid-overwrite", "true")); }
    // 'x-oss-server-side-encryption'
    // 'x-oss-server-side-data-encryption'
    // 'x-oss-server-side-encryption-key-id': do not use server side encryption
    // 'x-oss-object-acl': default should be enough
    // 'x-oss-storage-class': use standard for now
    // 'x-oss-meta-*'
    // 'x-oss-tagging': no metadata needed for now
    // 'x-oss-object-worm-mode'
    // 'x-oss-object-worm-retain-util-date': what is worm?

    let mut file = File::open(options.file_path).await?;
    // size
    let file_size = if options.provided_size > 0 {
        options.provided_size
    } else {
        file.metadata().await?.len() as usize
    };
    // headers is using &str, you need extend lifetime to hold the String if it is calculated
    let hash_value;
    match &options.checksum {
        UploadChecksumOption::None => {},
        UploadChecksumOption::Calculate => {
            let mut buffer = vec![0; 1048576]; // TODO change to object pool
            let mut hasher = blake3::Hasher::new();
            loop {
                let len = file.read(&mut buffer).await?;
                if len == 0 { break; }
                hasher.update(&buffer[..len]);
            }
            let hash = hasher.finalize();
            hash_value = hash.to_hex();
            headers.push((OBJECT_META_HASH, hash_value.as_str()));
            file.seek(std::io::SeekFrom::Start(0)).await?;
        },
        UploadChecksumOption::Provided(value) => headers.push((OBJECT_META_HASH, value)),
    }

    let request = build_request(config, client, Method::PUT,
        Some(options.object_path), /* queries */ Vec::new(), headers, Some((file.into(), file_size)))?;
    /* response is not used */ send_request(client, request).await?;
    Ok(())
}
struct CopyOptions<'a> {
    source_path: &'a Path,
    target_path: &'a Path,
    forbid_overwrite: bool,
}
// duplicate from remote to remote
async fn copy_object(config: &Config, client: &Client, options: CopyOptions<'_>) -> Result<()> {
    // https://help.aliyun.com/zh/oss/developer-reference/copyobject
    // this is similar to upload with an additional header and without a body
    let mut headers = Vec::new();
    // to make things consistent,
    // although this is only called by handle_copy which will make path absolute if not
    // provided in command line, still require object path absoluate and trim root to send request
    let Ok(source_path) = options.source_path.strip_prefix("/") else {
        bail!("source path should be absolute: {}", options.source_path.display());
    };
    // NOTE not join(options.source_path), absolute source path will overwrite /bucketname in join
    let copy_source = PathBuf::from("/").join(&config.bucket).join(source_path);
    headers.push(("x-oss-copy-source", copy_source.to_str()
        .unwrap_or("how-do-you-make-an-invalid-utf8-object-path")));
    if options.forbid_overwrite { headers.push(("x-oss-forbid-overwrite", "true")); }
    let request = build_request(config, client, Method::PUT,
        Some(options.target_path), /* queries */ Vec::new(), headers, /* body */ None)?;
    /* response is not used */ send_request(client, request).await?;
    Ok(())
}

struct HeadOptions<'a> {
    object_path: &'a Path,
}
// retrieve header information, same as download but without actually download,
// return response because response.headers borrows response
async fn head_object(config: &Config, client: &Client, options: HeadOptions<'_>) -> Result<Response> {
    // https://help.aliyun.com/zh/oss/developer-reference/headobject
    let queries = Vec::new();
    let headers = Vec::new();
    let request = build_request(config, client, Method::HEAD, // <-- this head
        Some(options.object_path), queries, headers, /* body */ None)?;
    let response = send_request(client, request).await?;
    Ok(response)
}
struct DownloadOptions<'a> {
    file_path: &'a Path,
    object_path: &'a Path,
}
async fn download_object(config: &Config, client: &Client, options: DownloadOptions<'_>) -> Result<()> {

    // https://help.aliyun.com/zh/oss/developer-reference/getobject
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
    let request = build_request(config, client, Method::GET,
        Some(options.object_path), queries, headers, /* body */ None)?;
    let mut response = send_request(client, request).await?;

    let mut file = File::create(options.file_path).await?;
    while let Some(chunk) = response.chunk().await? { file.write_all(&chunk).await?; }
    Ok(())
}

struct DeleteOptions<'a> {
    object_path: &'a Path,
}
// NOTE this does not return error if file previously not exist
async fn delete_object(config: &Config, client: &Client, options: DeleteOptions<'_>) -> Result<()> {
    // https://help.aliyun.com/zh/oss/developer-reference/deleteobject
    let request = build_request(config, client, Method::DELETE,
        Some(options.object_path), /* queries */ Vec::new(), /* headers */ Vec::new(), /* body */ None)?;
    /* response is not used */ send_request(client, request).await?;
    Ok(())
}

#[derive(Args, Debug)]
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
    #[arg(long, default_value_t = 100, value_name = "COUNT",
        help = "limit page count in case you there is error in pagination logic")]
    max_page_count: usize,
    #[arg(short, long, value_enum, help = "for now only csv")]
    format: Option<ListCommandFormat>,
}
#[derive(Copy, Clone, Debug, ValueEnum)]
enum ListCommandFormat {
    Csv,
}
async fn handle_list(config: &Config, command: &ListCommand) -> Result<()> {

    let client = Client::new();
    let options = ListOptions {
        count: command.count,
        start_after: command.start_after.as_deref(),
        prefix: command.prefix.as_deref(),
        r#continue: command.r#continue,
        max_page_count: command.max_page_count,
    };
    let objects = list_objects(config, &client, options).await?;

    let (count, total_size) = objects.iter()
        .fold((0, 0), |(c, s), f| (c + 1, s + f.size));
    for object in objects {
        println!("{},{},{}", object.path.display(), object.size, object.upload_time);
    }
    if !matches!(command.format, Some(ListCommandFormat::Csv)) {
        println!("list {} objects {} bytes", count, total_size);
    }
    Ok(())
}

#[derive(Args, Debug)]
struct CopyCommand {
    #[arg(index(1), help = "source path")]
    source: String,
    #[arg(index(2), help = "target path")]
    target: String,
    #[arg(short = 'O', long, help = "do not overwrite if target exist")]
    forbid_overwrite: bool,
    #[arg(short = 'a', long, help = "set checksum metadata (use in sync)")]
    checksum: bool,
    #[arg(long, help = "?")]
    why_do_you_want_to_copy_from_local_to_local_by_this_command: bool, // ??
}
async fn handle_copy(config: &Config, command: &CopyCommand) -> Result<()> {
    let client = Client::new();
    match (command.source.strip_prefix("oss:"), command.target.strip_prefix("oss:")) {
        // upload single file
        (None, Some(target)) => {
            let (source, target) = match (command.source == "same", target == "same") {
                (false, false) => (command.source.as_str(), target),
                (false, true) => (command.source.as_str(), command.source.as_str()),
                (true, false) => (target, target),
                (true, true) => bail!("source and target recursive reference"),
            };
            let file_path = Path::new(source);
            if !file_path.try_exists()? {
                bail!("file {} not exist", file_path.display());
            }
            // this waste allocation if source is already absolute,
            // but I think I'm not likely to append root in command line so ok
            let object_path = PathBuf::from("/").join(target);
            let options = UploadOptions {
                file_path,
                object_path: &object_path,
                forbid_overwrite: command.forbid_overwrite,
                provided_size: 0,
                checksum: if command.checksum {
                    UploadChecksumOption::Calculate
                } else { UploadChecksumOption::None },
            };
            upload_object(config, &client, options).await?;
            println!("upload from {} to {} complete", source, target);
        },
        // download single file
        (Some(source), None) => {
            let (source, target) = match (source == "same", command.target == "same") {
                (false, false) => (source, command.target.as_str()),
                (false, true) => (source, source),
                (true, false) => (command.target.as_str(), command.target.as_str()),
                (true, true) => bail!("source and target recursive reference"),
            };
            // this waste allocation if source is already absolute,
            // but I think I'm not likely to append root in command line so ok
            let object_path = PathBuf::from("/").join(source);
            let file_path = Path::new(target);
            if command.forbid_overwrite && !file_path.try_exists()? {
                bail!("file {} already exists", target);
            }
            let options = DownloadOptions {
                object_path: &object_path,
                file_path,
            };
            download_object(config, &client, options).await?;
            println!("download from {} to {} complete", source, target);
        },
        // remote duplicate
        (Some(source), Some(target)) => {
            if source == "same" || target == "same" {
                bail!("source and target cannot be same");
            }
            let source_path = PathBuf::from("/").join(source);
            let target_path = PathBuf::from("/").join(target);
            let options = CopyOptions {
                source_path: &source_path,
                target_path: &target_path,
                forbid_overwrite: command.forbid_overwrite,
            };
            copy_object(config, &client, options).await?;
            println!("duplicate from {} to {} complete", source, target);
        },
        // ???
        (None, None) => {
            if !command.why_do_you_want_to_copy_from_local_to_local_by_this_command {
                println!("you forget to add oss: prefix, if you really mean to, \
                    add --why-do-you-want-to-copy-from-local-to-local-by-this-command");
            } else /* really want copy from local to local by this command */ {
                if command.forbid_overwrite && fs::try_exists(&command.target).await? {
                    bail!("target file {} exists", command.target);
                }
                fs::copy(&command.source, &command.target).await?;
            }
        },
    }
    Ok(())
}

#[derive(Args, Debug)]
struct DropCommand {
    #[arg(index(1), value_name = "PATH", help = "object path to drop")]
    object_path: String,
}
async fn handle_drop(config: &Config, command: &DropCommand) -> Result<()> {

    let client = Client::new();
    // ignore oss: prefix, this make command parameters more consistent
    let object_path = command.object_path.strip_prefix("oss:");
    // make path absolute
    let object_path = PathBuf::from("/").join(object_path.unwrap_or(&command.object_path));
    let options = ListOptions {
        count: None,
        start_after: None,
        // don't load all files
        // unwrap 1: they come from join to root path
        // unwrap 2: how do you make an invalid utf8 string
        prefix: Some(object_path.strip_prefix("/").unwrap().to_str().unwrap()),
        r#continue: false, // no need to continue
        max_page_count: 100,
    };
    let objects = list_objects(config, &client, options).await?;
    if !objects.iter().any(|o| o.path == object_path) {
        bail!("object {} not found", object_path.display());
    }

    let options = DeleteOptions {
        object_path: &object_path,
    };
    delete_object(config, &client, options).await?;
    println!("drop {} complete", object_path.display());
    Ok(())
}

#[derive(Args, Debug)]
struct SyncCommand {
    #[arg(index(1), help = "source path")]
    source: String,
    #[arg(index(2), help = "target path")]
    target: String,
    #[arg(short = 'a', long, help = "use checksum")]
    checksum: bool,
    #[arg(short = 'n', long, help = "stop before actually send file")]
    dry_run: bool,
}
async fn handle_sync(config: &Config, command: &SyncCommand) -> Result<()> {
    
    #[derive(PartialEq, Eq)] enum Action { Upload, Download } use Action::*;
    // 1. process source and target
    let (action, local_directory, remote_directory) = match (
        command.source.strip_prefix("oss:"),
        command.target.strip_prefix("oss:"),
    ) {
        (None, None) => bail!("cannot sync from local directory to local directory"),
        (Some(_), Some(_)) => bail!("cannot sync from remote directory to remote directory"),
        // handle oss:root by the way
        (None, Some(target)) => (Upload, command.source.as_str(), if target == "root" { "" } else { target }),
        (Some(source), None) => (Download, command.target.as_str(), if source == "root" { "" } else { source }),
    };
    let (local_directory, remote_directory) = match (local_directory == "same", remote_directory == "same") {
        (false, true) => (local_directory, local_directory),
        (true, false) => (remote_directory, remote_directory),
        (false, false) => (local_directory, remote_directory),
        (true, true) => bail!("source and target recursive reference"),
    };
    // make absolute, this accepts both relative path and absolute path
    let local_directory = PathBuf::from("/").join(local_directory);
    let remote_directory = PathBuf::from("/").join(remote_directory);

    // 2. list items
    // at this step, only path and size is collected, unify them into same structure
    struct Item { path: PathBuf, size: usize }
    let metadata = fs::metadata(&local_directory).await?;
    if !metadata.is_dir() {
        bail!("local directory {} is not a directory", local_directory.display());
    }
    let mut local_files = Vec::new();
    // - this is not async, listdir should be very fast and no need to async
    // - filter_map: ignore not ok entry (likely permission error)
    for entry in walkdir::WalkDir::new(&local_directory).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            local_files.push(Item{
                // it is said that walkdir's entry metadata is cheap, use that
                size: entry.metadata()?.len() as usize,
                path: entry.into_path(),
            });
        }
    }
    let client = Client::new();
    let options = ListOptions {
        count: None,
        start_after: None,
        // unwrap 1: they come from join to root path
        // unwrap 2: they come from valid utf8 string
        prefix: Some(remote_directory.strip_prefix("/").unwrap().to_str().unwrap()),
        r#continue: true,
        max_page_count: 100,
    };
    let remote_objects = list_objects(config, &client, options).await?.into_iter().map(|object| Item {
        path: object.path,
        size: object.size,
    }).collect::<Vec<_>>();

    let (source_items, target_items) =
        if action == Upload { (local_files, remote_objects) } else { (remote_objects, local_files) };
    let (source_directory, target_directory) =
        if action == Upload { (local_directory, remote_directory) } else { (remote_directory, local_directory) };
    // 3. foreach source item, task return Ok(true) for done actual work, Ok(false) for skip
    let task_results = futures::future::join_all(source_items.into_iter().map(async |source_item| {
        // use relative path as item display name
        let relative_path = source_item.path.strip_prefix(&source_directory)
            .map_err(|_| anyhow!("source item path {} does not have a source \
            directory prefix {}?", source_item.path.display(), source_directory.display()))?;
        // use in upload, this means even command.checksum is not enabled, still require upload_object
        // to calculate and set hash, also save calculated hash if it is calculated in the decision process
        let mut upload_checksum = UploadChecksumOption::Calculate;
        // 3.1. determine whether this item need update
        let target_item_path = target_directory.join(relative_path);
        if let Some(target_item) = target_items.iter().find(|t| t.path == target_item_path) {
            trace!("source item {} find target item {}", relative_path.display(), target_item.path.display());
            if source_item.size != target_item.size {
                trace!("source item {} size {} != target size {}, \
                    need update", relative_path.display(), source_item.size, target_item.size);
            } else if !command.checksum {
                // name + size is same, no furthur work needed on this item
                return Ok(false);
            } else {
                let (local_item, remote_item) =
                    if action == Upload { (&source_item, target_item) } else { (target_item, &source_item) };
                // name + size is same, need checksum
                let mut file = File::open(&local_item.path).await?;
                let mut buffer = vec![0; 1048576]; // TODO change to object pool
                let mut hasher = blake3::Hasher::new();
                loop {
                    let len = file.read(&mut buffer).await?;
                    if len == 0 { break; }
                    hasher.update(&buffer[..len]);
                }
                let file_hash = hasher.finalize();
                trace!("item {} file hash {:?}", relative_path.display(), file_hash);
                let head_response = head_object(config, &client, HeadOptions{ object_path: &remote_item.path }).await?;
                let object_hash = head_response.headers().get(OBJECT_META_HASH);
                trace!("item {} object hash {:?}", relative_path.display(), object_hash);
                if let Some(object_hash) = &object_hash {
                    if object_hash == &&*file_hash.to_hex() {
                        // hash is also same, no furthur work needed on this item
                        return Ok(false);
                    }
                    trace!("item {} hash not same, need update", relative_path.display());
                } else {
                    trace!("item {} object not found hash, regard as need update", relative_path.display());
                }
                upload_checksum = UploadChecksumOption::Provided(file_hash.to_hex().to_string());
            }
        } else {
            trace!("item {} not found in target, need update", relative_path.display());
        }
        // 3.2. send item
        if command.dry_run {
            println!("will {action}load {} to {}", source_item.path.display(),
                target_item_path.display(), action = if action == Upload { "up" } else { "down" });
        } else if action == Upload {
            let options = UploadOptions {
                file_path: &source_item.path,
                object_path: &target_item_path,
                forbid_overwrite: false,
                provided_size: source_item.size,
                checksum: upload_checksum,
            };
            upload_object(config, &client, options).await?;
            println!("upload {} to {} complete", relative_path.display(), target_item_path.display());
        } else {
            let options = DownloadOptions {
                object_path: &source_item.path,
                file_path: &target_item_path,
            };
            download_object(config, &client, options).await?;
            println!("download {} to {} complete", source_item.path.display(), relative_path.display());
        }
        Ok(true)
    })).await;

    // 3.3 print result
    let mut has_send = false;
    task_results.into_iter().map(|r| r
        .inspect(|r| if *r { has_send = true; })
        .inspect_err(|e| eprintln!("failed to process item: {}", e)))
        .collect::<Result<Vec<_>>>().with_context(|| "failed to run some tasks")?;
    if !has_send { println!("up to date"); }
    Ok(())
}

#[derive(Parser, Debug)]
#[command(about = "Aliyun OSS CLI tool")]
struct Command {
    #[arg(short, long, help = "config file", value_name = "PATH", env = "DOKI_CONFIG")]
    config: PathBuf,
    #[arg(long, help = "do not print active config path if environment variable \
            is set (the hint may help you diagnose unexpectedly used config path)")]
    no_implicit_config_hint: bool,
    #[command(subcommand)]
    kind: CommandKind,
}
#[derive(Subcommand, Debug)]
enum CommandKind {
    #[command(about = "list or query objects")]
    List(ListCommand),
    #[command(about = "drop object")]
    Drop(DropCommand),
    #[command(about = "copy file from local to remote or remote to local", after_help = "source/target specification:
  - start with \"oss:\" for oss path
  - relative oss path are regarded as relative to root, e.g. oss:filename.txt means oss:/filename.txt
  - use \"same\" for same as another name, e.g. copy filename.txt oss:same, or copy oss:filename.txt same")]
    Copy(CopyCommand),
    #[command(about = "sync directory from local to remote or remote to local", after_help = "source/target specification:
  - start with \"oss:\" for oss path
  - relative oss path are regarded as relative to root, e.g. oss:filename.txt means oss:/filename.txt
  - use \"oss:root\" for oss root path, you won't use root as a normal folder, right?
  - use \"same\" for same as another name, e.g. sync directory-name oss:same, or copy oss:directory-name oss:same")]
    Sync(SyncCommand),
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let command = Command::parse();
    info!("command {:?}", command);
    if !command.no_implicit_config_hint && std::env::var_os("DOKI_CONFIG").is_some() {
        println!("use config path {}", command.config.display());
    }
    let config_original_content = fs::read_to_string(&command.config).await?;
    let config: Config = toml::from_str(&config_original_content)?;
    info!("config region {} bucket {} access key id {}", config.region, config.bucket, config.access_key_id);

    match &command.kind {
        CommandKind::List(command) => handle_list(&config, command).await?,
        CommandKind::Copy(command) => handle_copy(&config, command).await?,
        CommandKind::Drop(command) => handle_drop(&config, command).await?,
        CommandKind::Sync(command) => handle_sync(&config, command).await?,
    }
    Ok(())
}

// docker run -it --rm --name doki1 -v .:/work -v ~/cargo-build-cache-2:/work/target -v ~/cargo-download-cache:/usr/local/cargo/registry -h RUST -w /work my/rust:1
// need this if dependencies need build: apk add musl-dev
// lint: rustup component add clippy && cargo clippy
