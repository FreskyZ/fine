use std::borrow::Cow;
use std::path::PathBuf;
use anyhow::{anyhow, bail, Context, Result};
use chrono::{DateTime, Utc};
use clap::{Parser, Subcommand, Args, ValueEnum};
use hmac::{Hmac, Mac, KeyInit};
use log::{trace, info};
use reqwest::{Client, Request, Method};
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

// reqwest RequestBuilder and Request is not easy to use for operations
// in this script, so the result is make Reqeust from custom request properties
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
    // body and size,
    // if you impl Into<Body> here, binary size will explode (not likely, libcrypto is too large)
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

    let mut headers = new_headers.into_iter()
        .chain(headers)
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
            Cow::Borrowed(k)
        } else {
            Cow::Owned(k.to_ascii_lowercase())
        })).collect::<Vec<_>>();
    // required by later signing process
    headers.sort_by(|(_, _, h1), (_, _, h2)| h1.cmp(&h2));

    let mut queries = queries.into_iter()
        .filter(|(_, v)| !v.is_empty())
        .map(|(k, v)| (k, v, if k.chars().all(|c| c.is_ascii_lowercase()) {
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

#[derive(Args, Debug, Default)]
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
    #[arg(short, long, value_enum, help = "for now only csv")]
    format: Option<ListCommandFormat>,
}
#[derive(Copy, Clone, Debug, ValueEnum)]
enum ListCommandFormat {
    Csv,
}

#[derive(Deserialize)]
struct ListResponse {
    #[serde(rename = "NextContinuationToken")]
    next_continuation_token: Option<String>,
    #[serde(rename = "Contents", skip_serializing_if = "Vec::is_empty", default)]
    contents: Vec<ListResponseObject>,
}
#[derive(Deserialize, Debug)]
struct ListResponseObject {
    #[serde(rename = "Key")]
    name: String,
    #[serde(rename = "LastModified")]
    mtime: String,
    #[serde(rename = "Size")]
    size: usize,
}

async fn list(config: &Config, client: &Client, time: DateTime<Utc>, command: &ListCommand) -> Result<Vec<ListResponseObject>> {

    let mut loop_count = 0;
    let mut all_objects = Vec::new();
    let mut continuation_token: Option<String> = None;
    loop {
        // https://help.aliyun.com/zh/oss/developer-reference/listobjects-v2
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
            all_objects.extend(response.contents);
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
    Ok(all_objects)
}

async fn handle_list(config: &Config, command: &ListCommand) -> Result<()> {

    let time = Utc::now();
    let client = Client::new();
    let objects = list(config, &client, time, command).await?;

    let (count, total_size) = objects.iter().fold((0, 0), |(c, s), f| (c + 1, s + f.size));
    for object in objects {
        println!("{},{},{}", object.name, object.size, object.mtime);
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
    #[arg(short = 'a', long, help = "set x-oss-meta-hash metadata (use in sync)")]
    hash: bool,
    #[arg(long, help = "?")]
    why_do_you_want_to_copy_from_local_to_local_by_this_command: bool, // ??
}
async fn handle_copy(config: &Config, command: &CopyCommand) -> Result<()> {

    let time = Utc::now();
    let client = Client::new();

    // TODO handle same
    let stripped_source = command.source.strip_prefix("oss:");
    let stripped_target = command.target.strip_prefix("oss:");

    // use if let to reduce one level of indent, and it put matched expression
    // more close to pattern if you are going to put large chunk of code in the match arms
    if let (None, Some(target)) = (stripped_source, stripped_target) {
        // upload: https://help.aliyun.com/zh/oss/developer-reference/putobject

        let queries = Vec::new();
        let mut headers = Vec::new();
        // 'cache-control': this is cache control when downloading, not used in this project
        // 'content-disposition': this is download behavior, too
        // 'content-encoding': no need to compress again, so leave it identity
        // 'content-md5': don't use md5
        // 'expires': no expires
        if command.forbid_overwrite { headers.push(("x-oss-forbid-overwrite", "true")); }
        // 'x-oss-server-side-encryption'
        // 'x-oss-server-side-data-encryption'
        // 'x-oss-server-side-encryption-key-id': do not use server side encryption
        // 'x-oss-object-acl': default should be enough
        // 'x-oss-storage-class': use standard for now
        // 'x-oss-meta-*'
        // 'x-oss-tagging': no metadata needed for now
        // 'x-oss-object-worm-mode'
        // 'x-oss-object-worm-retain-util-date': what is worm?

        let mut file = File::open(&command.source).await?;
        let file_size = file.metadata().await?.len() as usize;
        let file_hash_hex; // extend lifetime
        if command.hash {
            let mut buffer = vec![0; 1048576]; // TODO change to object pool
            let mut hasher = blake3::Hasher::new();
            loop {
                let len = file.read(&mut buffer).await?;
                if len == 0 { break; }
                hasher.update(&buffer[..len]);
            }
            let file_hash = hasher.finalize();
            file_hash_hex = file_hash.to_hex();
            file.seek(std::io::SeekFrom::Start(0)).await?;
            headers.push((sync::OBJECT_META_HASH, file_hash_hex.as_str()));
        }

        let request = build_request(config, &client, time,
            Method::PUT, Some(target), queries, headers, Some((file.into(), file_size)))?;
        let response = client.execute(request).await?; // <-- send is here

        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }
        if status.is_success() {
            println!("upload from {} to {} complete", command.source, command.target);
        } else {
            let response_body = response.text().await?;
            trace!("response body {}", response_body);
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("error {}: {:?}", response.code, response.message));
        }
    } else if let (Some(source), None) = (stripped_source, stripped_target) {
        // download: https://help.aliyun.com/zh/oss/developer-reference/getobject

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

        let request = build_request(config, &client, time,
            Method::GET, Some(&command.target), queries, headers, /* body */ None)?;
        let mut response = client.execute(request).await?; // <-- send is here

        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }

        if status.is_success() {
            let mut file = File::create(source).await?;
            while let Some(chunk) = response.chunk().await? {
                file.write_all(&chunk).await?;
            }
            println!("download from {} to {} complete", command.source, command.target);
        } else {
            let response_body = response.text().await?;
            trace!("response body {}", response_body);
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("error {}: {:?}", response.code, response.message));
        }
    } else if let (Some(source), Some(target)) = (stripped_source, stripped_target) {
        // remote duplicate: https://help.aliyun.com/zh/oss/developer-reference/copyobject
        // this is similar to upload with an additional header and without a body
        let queries = Vec::new();
        let mut headers = Vec::new();
        headers.push(("x-oss-copy-source", source));
        if command.forbid_overwrite { headers.push(("x-oss-forbid-overwrite", "true")); }

        let request = build_request(config, &client, time,
            Method::PUT, Some(target), queries, headers, /* body */ None)?;
        let response = client.execute(request).await?; // <-- send is here

        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }
        if status.is_success() {
            println!("duplicate from {} to {} complete", command.source, command.target);
        } else {
            let response_body = response.text().await?;
            trace!("response body {}", response_body);
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("error {}: {:?}", response.code, response.message));
        }
    } else /* (None, None) */ {
        // ???
        if !command.why_do_you_want_to_copy_from_local_to_local_by_this_command {
            println!("you forget to add oss: prefix, if you really mean to, \
                add --why-do-you-want-to-copy-from-local-to-local-by-this-command");
        } else /* really want copy from local to local by this command */ {
            if command.forbid_overwrite && fs::try_exists(&command.target).await? {
                return Err(anyhow!("target file {} exists", command.target));
            }
            fs::copy(&command.source, &command.target).await?;
        }
    }
    Ok(())
}

#[derive(Args, Debug)]
struct DropCommand {
    #[arg(index(1), help = "object name to drop")]
    name: String,
}
async fn handle_drop(config: &Config, command: &DropCommand) -> Result<()> {

    let time = Utc::now();
    let client = Client::new();

    let list_command = ListCommand {
        prefix: Some(command.name.clone()), // don't load irrelavent files
        r#continue: false, // no need to continue
        ..Default::default()
    };
    let objects = list(config, &client, time, &list_command).await?;
    if !objects.iter().any(|o| o.name == command.name) {
        return Err(anyhow!("not found object {}", command.name));
    }

    // https://help.aliyun.com/zh/oss/developer-reference/deleteobject
    let queries = Vec::new();
    let headers = Vec::new();
    let request = build_request(config, &client, time,
        Method::DELETE, Some(&command.name), queries, headers, /* body */ None)?;
    let response = client.execute(request).await?; // <-- send is here

    let status = response.status();
    trace!("response status: {}", status);
    for (k, v) in response.headers() {
        trace!("response header {} = {:?}", k, v);
    }
    if status.is_success() {
        println!("drop {} complete", command.name);
    } else {
        let response_body = response.text().await?;
        trace!("response body {}", response_body);
        let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
        return Err(anyhow!("error {}: {:?}", response.code, response.message));
    }
    Ok(())
}


mod sync {
    use super::*;

    #[derive(Clone, Copy, Default)]
    enum Location { #[default] Local, Remote }
    #[derive(Clone, Copy, Default, PartialEq, PartialOrd, Eq, Ord)]
    enum Direction { #[default] Source, Target }

    // 1. unify source and target into same representation and validate by the way
    #[derive(Clone, Copy)]
    struct Provider<'a> {
        path: &'a str,
        location: Location,
        direction: Direction,
    }
    impl<'a> Provider<'a> {
        fn is_local(&self) -> bool { matches!(self.location, Location::Local) }
        fn is_remote(&self) -> bool { matches!(self.location, Location::Remote) }
    }
    fn validate_providers<'a>(source: &'a str, target: &'a str) -> Result<(Provider<'a>, Provider<'a>)> {
        // TODO handle same and root
        match (source.strip_prefix("oss:"), target.strip_prefix("oss:")) {
            (None, None) => bail!("cannot sync from local directory to local directory"),
            (Some(_), Some(_)) => bail!("cannot sync from remote directory to remote directory, fow now"),
            (Some(source), None) => Ok((
                Provider{ path: source, direction: Direction::Source, location: Location::Remote },
                Provider{ path: target, direction: Direction::Target, location: Location::Local },
            )),
            (None, Some(target)) => Ok((
                Provider{ path: source, direction: Direction::Source, location: Location::Local },
                Provider{ path: target, direction: Direction::Target, location: Location::Remote },
            )),
        }
    }

    // 2. get items
    #[derive(Default)]
    struct Item {
        location: Location,
        direction: Direction,
        // absolute local path or full object name
        full_name: String,
        // path relative to provider path
        name: String,
        size: usize,
        // after step 1, match: true means find match name + size
        r#match: bool,
        // file for this item
        file: Option<File>,
        hash: Option<String>,
        // file and counterparty_file cannot be both filled,
        // but if you reuse them, borrow checker will not be happy at a specific position
        counterparty_file: Option<File>,
        counterparty_full_name: Option<String>,
    }
    impl Item {
        fn new(provider: Provider, full_name: String, name: String, size: usize) -> Item {
            Item{
                location: provider.location,
                direction: provider.direction,
                full_name,
                name,
                size,
                r#match: false,
                file: None,
                hash: None,
                counterparty_file: None,
                counterparty_full_name: None,
            }
        }
    }

    async fn get_items(config: &Config, client: &Client, time: DateTime<Utc>, provider: Provider<'_>) -> Result<Vec<Item>> {
        let mut results = Vec::new();
        if provider.is_local() {
            let metadata = fs::metadata(provider.path).await?;
            if !metadata.is_dir() {
                bail!("local directory {} is not a directory", provider.path);
            }
            // - this is not async, it's ok assuming list dir is very fast
            // - filter_map: ignore not ok entry (likely permission error)
            for entry in walkdir::WalkDir::new(provider.path).into_iter().filter_map(|e| e.ok()) {
                if entry.file_type().is_file() {
                    // it is said that walkdir's entry metadata is cheap, use that
                    let size = entry.metadata()?.len() as usize;
                    let name = entry.path().strip_prefix(provider.path)?.display().to_string();
                    let full_name = entry.into_path().into_os_string().into_string()
                        .map_err(|_| anyhow!("item {} full path cannot convert osstring?", name))?;
                    results.push(Item::new(provider, full_name, name, size));
                }
            }
        } else if provider.is_remote() {
            let command = ListCommand{ prefix: Some(provider.path.to_string()), r#continue: true, ..Default::default() };
            let objects = list(config, &client, time, &command).await?;
            for object in objects {
                let name = object.name
                    .strip_prefix(provider.path)
                    .with_context(|| format!("object {} cannot strip prefix {}?", object.name, provider.path))?
                    .to_string();
                results.push(Item::new(provider, object.name, name, object.size));
            }
        }
        Ok(results)
    }

    pub const OBJECT_META_HASH: &str = "x-oss-meta-hash";
    async fn get_item_hash(config: &Config, client: &Client, time: DateTime<Utc>, mut item: Item) -> Result<Item> {
        if matches!(item.location, Location::Local) {
            let mut file = if matches!(item.direction, Direction::Source) {
                // upload operation need read file later, need reset cursor later
                File::open(&item.full_name).await?
            } else {
                // download operation need read file for hash, need truncate file later
                fs::OpenOptions::new().read(true).write(true).create(true).open(&item.full_name).await?
            };
            let mut buffer = vec![0; 1048576]; // TODO change to object pool
            let mut hasher = blake3::Hasher::new();
            loop {
                let len = file.read(&mut buffer).await?;
                if len == 0 { break; }
                hasher.update(&buffer[..len]);
            }
            item.file = Some(file);
            item.hash = Some(hasher.finalize().to_string());
            trace!("item {} file hash {:?}", item.name, item.hash);
        } else {
            let request = build_request(config, &client, time,
                //      vvvv head
                Method::HEAD, Some(&item.full_name), Vec::new(), Vec::new(), /* body */ None)?;
            let response = client.execute(request).await?; // <-- send is here

            let status = response.status();
            trace!("response status: {}", status);
            for (k, v) in response.headers() {
                trace!("response header {} = {:?}", k, v);
            }
            if !status.is_success() {
                let response_body = response.text().await?;
                trace!("response body {}", response_body);
                let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
                return Err(anyhow!("error head object {} {}: {:?}", item.full_name, response.code, response.message));
            }
            item.hash = response.headers().get(OBJECT_META_HASH).map(|v| -> Result<String> { Ok(v.to_str()?.to_string()) }).transpose()?;
            trace!("item {} object hash {:?}", item.name, item.hash);
        }
        Ok(item)
    }

    async fn send_item(config: &Config, client: &Client, time: DateTime<Utc>, item: Item) -> Result<String> {

        let queries = Vec::new();
        let request = if matches!(item.location, Location::Local) {
            // for upload, reset file cursor, set header set hash
            let mut file = item.file
                .ok_or_else(|| anyhow!("you don't have file at this stage? item {}", item.name))?;
            file.seek(std::io::SeekFrom::Start(0)).await?;
            let hash = item.hash.as_deref()
                .ok_or_else(|| anyhow!("you don't have hash at this stage? item {}", item.name))?;
            let headers = vec![(OBJECT_META_HASH, hash)];
            let object_name = item.counterparty_full_name.as_deref();
            build_request(config, &client, time,
                Method::PUT, object_name, queries, headers, Some((file.into(), item.size)))?
        } else {
            let headers = Vec::new();
            build_request(config, &client, time,
                Method::GET, Some(&item.full_name), queries, headers, /* body */ None)?
        };

        let mut response = match client.execute(request).await {
            Ok(response) => response,
            Err(error) => return Err(anyhow!("{:?}", error)),
        };
        let status = response.status();
        trace!("response status: {}", status);
        for (k, v) in response.headers() {
            trace!("response header {} = {:?}", k, v);
        }
        if !status.is_success() {
            let response_body = response.text().await?;
            trace!("response body {}", response_body);
            let response: ErrorResponse = serde_xml_rs::from_str(&response_body)?;
            return Err(anyhow!("failed to upload {} {}: {:?}", item.name, response.code, response.message));
        }

        if matches!(item.location, Location::Local) {
            // for upload, done here
            return Ok(format!("upload {} success", item.name));
        } else {
            // for download, truncate file content if file opened, or else create file
            let mut file = if let Some(file) = item.counterparty_file {
                file.set_len(0).await?; file
            } else {
                let file_path = item.counterparty_full_name.as_deref()
                    .ok_or_else(|| anyhow!("you don't have counterparty full name at this stage? item {}", item.name))?;
                File::create(file_path).await?
            };
            while let Some(chunk) = response.chunk().await? {
                file.write_all(&chunk).await?;
            }
            file.sync_all().await?;
            return Ok(format!("download {} success", item.name));
        }
    }

    #[derive(Args, Debug)]
    pub struct Command {
        #[arg(index(1), help = "source path")]
        source: String,
        #[arg(index(2), help = "target path")]
        target: String,
        #[arg(short = 'a', long, help = "use hash to check file update")]
        hash: bool,
        #[arg(short = 'n', long, help = "stop before actually send file")]
        dry_run: bool,
        #[arg(long, default_value_t = 100, value_name = "COUNT",
            help = "limit task count in case you accidentally uploaded node_modules/.git/rootfs")]
        max_task_count: usize,
    }

    pub async fn handle(config: &Config, command: &Command) -> Result<()> {

        let time = Utc::now();
        let client = Client::new();
        // 1. validate providers
        let (source, target) = validate_providers(&command.source, &command.target)?;
        // 2. get items
        let (source_list_result, target_list_result) = futures::future::join(
            get_items(config, &client, time, source),
            get_items(config, &client, time, target),
        ).await;
        let (Ok(mut source_list), Ok(mut target_list)) = (
            source_list_result.inspect_err(|e| eprintln!("failed to get source list: {:?}", e)),
            target_list_result.inspect_err(|e| eprintln!("failed to get target list: {:?}", e)),
        ) else {
            bail!("failed to get source or target list");
        };

        // collect part 1, mark name+size mismatch
        // - include names in source but not in target, not include names not in target but not in source
        // - previous step already collected name and size, this step don't need to be async and parallel
        let mut match_count = 0;
        for source_item in &mut source_list {
            if let Some(target_item) = target_list.iter_mut().find(|t| t.name == source_item.name) {
                if source_item.size == target_item.size {
                    source_item.r#match = true;
                    target_item.r#match = true;
                    match_count += 1;
                } else {
                    trace!("source item {} size {} != target item size {}, \
                        mark mismatch", source_item.name, source_item.size, target_item.size);
                }
            } else {
                trace!("source item {} not found in target list, mark mismatch", source_item.name);
            }
        }
        // match = true first, then match = false
        // assuming match items should be a lot more than mismatch items
        source_list.sort_by(|i1, i2| i2.r#match.cmp(&i1.r#match));
        target_list.sort_by(|i1, i2| i2.r#match.cmp(&i1.r#match));
        // mismatched source list is always used regardless of command.hash
        let mut mismatch_source_list = source_list.split_off(match_count);
        // mismatched target item is never used, they can be truncated
        target_list.truncate(match_count);

        let name_size_mismatch_count = mismatch_source_list.len();
        let hash_task_count =
            if command.hash { match_count * 2 } else { 0 } // for match=true, need hash if command.hash
            + if source.is_local() { name_size_mismatch_count } else { 0 }; // for source list match=false, need hash if is upload
        if hash_task_count > command.max_task_count {
            bail!("task count {} exceeds configured limit {} for collect hash, \
                manually increase it if you really need", hash_task_count, command.max_task_count);
        }
        // calculate or load hash for items
        let task_results = futures::future::join_all((if command.hash {
            source_list
        } else { Vec::new() }).into_iter().chain(if command.hash {
            target_list
        } else { Vec::new() }).chain(if source.is_local() {
            // use mem::take to leave items available in original vec if condition not meet
            std::mem::take(&mut mismatch_source_list)
        } else { Vec::new() }).map(|item| get_item_hash(config, &client, time, item))).await;
        // print error and abort if any error
        let mut task_results = task_results.into_iter().map(
            |r| r.inspect_err(|e| eprintln!("failed to get hash: {:?}", e))
        ).collect::<Result<Vec<_>>>()?;
        // split off source items and target items
        task_results.sort_by(|r1, r2| r1.direction.cmp(&r2.direction));
        let mut target_list = task_results.split_off(if command.hash { match_count }
            else { 0 } + if source.is_local() { name_size_mismatch_count } else { 0 });
        let source_list = task_results;

        let mut mismatch_items = Vec::new();
        // if is download, name + size mismatch items are still in original mismatch source list
        if source.is_remote() { mismatch_items.extend(mismatch_source_list); }
        for mut source_item in source_list {
            if !source_item.r#match {
                mismatch_items.push(source_item);
            } else {
                let target_item = target_list.iter_mut().find(|t| t.name == source_item.name)
                    .ok_or_else(|| anyhow!("you cannot find target item at this stage?"))?;
                if source_item.hash != target_item.hash {
                    trace!("source item {} hash {:?} not same as target {:?}, \
                        mark mismatch", source_item.name, source_item.hash, target_item.hash);
                    assert!(source_item.file.is_none());
                    source_item.counterparty_file = std::mem::take(&mut target_item.file);
                    source_item.counterparty_full_name = Some(std::mem::take(&mut target_item.full_name));
                    mismatch_items.push(std::mem::take(&mut source_item));
                }
            }
        }
        // some early return for tasks
        if mismatch_items.is_empty() {
            println!("up to date");
            return Ok(());
        } else if mismatch_items.len() > command.max_task_count {
            return Err(anyhow!("task count {} exceeds configured limit {} after \
                collect, manually increase it if you really need", mismatch_items.len(), command.max_task_count));
        } else if command.dry_run {
            for item in mismatch_items {
                println!("will {} {}", if source.is_local() { "upload" } else { "download" }, item.name);
            }
            return Ok(());
        }
        let task_results = futures::future::join_all(mismatch_items
            .into_iter().map(|item| send_item(config, &client, time, item))).await;
        let mut has_error = false;
        for result in task_results {
            match result {
                Ok(result) => println!("{}", result),
                Err(error) => { has_error = true; eprintln!("failed to send file: {:?}", error); },
            }
        }
        if has_error { Err(anyhow!("failed to send some files")) } else { Ok(()) }
    }
}

#[derive(Parser, Debug)]
#[command(about = "Aliyun OSS CLI tool")]
struct Command {
    #[arg(short, long, help = "config file", value_name = "PATH", env = "OSS_CONFIG")]
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
  - oss path should not start with '/', e.g. oss:filename.txt always mean root location filename.txt
  - use \"same\" for same as another name, e.g. copy filename.txt oss:same, or copy oss:filename.txt same")]
    Copy(CopyCommand),
    #[command(about = "sync directory from local to remote or remote to local", after_help = "source/target specification:
  - start with \"oss:\" for oss path
  - oss path should not start with '/', e.g. oss:filename.txt always mean root location filename.txt
  - use \"oss:root\" for oss root path, you won't use root as a normal folder, right?
  - use \"same\" for same as another name, e.g. sync directory-name oss:same, or copy oss:directory-name oss:same")]
    Sync(sync::Command),
}

#[tokio::main]
async fn main() -> Result<()> {
    env_logger::init();

    let command = Command::parse();
    info!("command {:?}", command);
    if !command.no_implicit_config_hint && std::env::var_os("OSS_CONFIG").is_some() {
        println!("use config path {}", command.config.display());
    }
    let config_original_content = fs::read_to_string(&command.config).await?;
    let config: Config = toml::from_str(&config_original_content)?;
    info!("config region {} bucket {} access key id {}", config.region, config.bucket, config.access_key_id);

    match &command.kind {
        CommandKind::List(command) => handle_list(&config, command).await?,
        CommandKind::Copy(command) => handle_copy(&config, command).await?,
        CommandKind::Drop(command) => handle_drop(&config, command).await?,
        CommandKind::Sync(command) => sync::handle(&config, command).await?,
    }
    Ok(())
}

// docker run -it --rm --name doki1 -v .:/work -v ~/cargo-build-cache-alioss:/work/target -v ~/cargo-download-cache:/usr/local/cargo/registry -h RUST -w /work my/rust:1
// need this if dependencies need build: apk add musl-dev
// TODO lint this
