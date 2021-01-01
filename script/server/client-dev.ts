import type * as http from 'http';
import { logInfo } from '../common';

// handle /client-dev.js from watching app-client

const clientdevjs =
`const ws=new WebSocket(\`wss://\${location.host}:PORT\`);` +
`ws.onmessage=e=>{` +
    `ws.send('ACK '+e.data);` +
    `if (e.data==='reload-js') {` +
    `location.reload();` +
    `} else if (e.data==='reload-css') {` +
    `const oldlink=Array.from(document.getElementsByTagName('link')).find(e=>e.getAttribute('href')==='/index.css');` +
    `const newlink=document.createElement('link');` +
    `newlink.setAttribute('rel','stylesheet');newlink.setAttribute('type','text/css');newlink.setAttribute('href','/index.css');` +
    `document.head.appendChild(newlink);` +
    `oldlink?.remove();` +
    `}` +
`};`;

// return true for handled
export function handle(port: number, request: http.IncomingMessage, response: http.ServerResponse): boolean {
    if (request.method == 'GET' && request.url == '/client-dev.js') {
        logInfo('htt', 'GET /client-dev.js');
        response.statusCode = 200;
        response.write(clientdevjs.replace('PORT', port.toString()));
        response.end();
        return true;
    } else {
        return false;
    }
}
