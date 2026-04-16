import http2 from 'node:http2';

const client = http2.connect('https://api.example.com');
client.on('error', error => console.log(`client error`, error));

async function authenticate() {
    const idAccessToken = '?';
    const authorizationCode = await new Promise((resolve, reject) => {
        const postdata = JSON.stringify({ return: 'https://app.example.com/demo/1' });
        const request = client.request({
            ':method': 'POST',
            ':path': '/generate-authorization-code',
            origin: 'https://id.example.com',
            authorization: `Bearer ${idAccessToken}`,
            "content-type": 'application/json',
            'content-length': Buffer.byteLength(postdata),
        });
        request.on('error', error => reject(error));
        request.on('response', (headers) => {
            console.log(`status`, headers[':status']);
        });
        request.setEncoding('utf-8');
        let data = '';
        request.on('data', chunk => { data += chunk; });
        request.on('end', () => {
            console.log(`received`, data);
            resolve(JSON.parse(data).code);
        });
        request.write(postdata);
        request.end();
    });
    const accessToken = await new Promise((resolve, reject) => {
        const request = client.request({
            ':method': 'POST',
            ':path': '/signin',
            origin: 'https://app.example.com',
            referer: 'https://app.example.com/demo/1',
            authorization: `Bearer ${authorizationCode}`,
        });
        request.on('error', error => reject(error));
        request.on('response', (headers) => {
            console.log(`status`, headers[':status']);
        });
        request.setEncoding('utf-8');
        let data = '';
        request.on('data', chunk => { data += chunk; });
        request.on('end', () => {
            console.log(`received`, data);
            resolve(JSON.parse(data).accessToken);
        });
        request.end();
    });
    return accessToken;
}
const accessToken = await authenticate();

// for now, path start with /v1, include query string
async function request(method: string, path: string, body?: any) {
    const postdata = body ? JSON.stringify(body) : '';
    const request = client.request({
        ':method': method,
        ':path': `/demo${path}`,
        origin: 'https://app.example.com',
        referer: 'https://app.example.com/demo/1',
        authorization: `Bearer ${accessToken}`,
        ...(body ? {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(postdata),
        }: {})
    });
    return await new Promise((resolve, reject) => {
        request.on('error', error => reject(error));
        request.on('response', (headers) => {
            console.log(`status`, headers[':status']);
        });
        request.setEncoding('utf-8');
        let data = '';
        request.on('data', chunk => { data += chunk; });
        request.on('end', () => {
            console.log(`received`, data);
            resolve(JSON.parse(data));
        });
        if (body) { request.write(postdata); }
        request.end();
    });
}

// expect 200 []
// await request('GET', '/v1/sessions');
// expect 400 missing required parameter sessionId
// await request('GET', '/v1/session');
// expect 400 invalid parameter session value nan
// await request('GET', '/v1/session?sessionId=nan');
// expect 404 session not found
// await request('GET', '/v1/session?sessionId=1');
// expect 200 { id, name }
// const session1 = await request('PUT', '/v1/add-session', { name: 'session1' });
// expect 200 [session1]
await request('GET', '/v1/sessions');

client.close();
// deploy demoapi: upload static src/servers/demoapi.js:servers/demoapi.js
// add demo: { host: app.example.com, module: ./servers/demoapi.js } to access.yml and restart container
// hot reload server: reload actions server demo, this may change to avoid actions server in future
// before run this script, replace example.com with real domain
