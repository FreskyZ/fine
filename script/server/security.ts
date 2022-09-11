import * as crypto from 'crypto';
import * as fs from 'fs';
import type * as http from 'http';
import type { AdminCommand } from '../../src/shared/types/admin';

// encrypt and decrypt command

// shadiao codebook
const codebook = fs.readFileSync('CODEBOOK', 'utf-8');

// generate random port, scrypt password and scrypt salt and store
export const port = Math.floor(Math.random() * 98 + 8001);
const scryptPasswordIndex = Math.floor(Math.random() * 899_900 + 99);
const scryptSaltIndex = Math.floor(Math.random() * 899_900 + 99);
fs.writeFileSync('akariv', `${port}:${scryptPasswordIndex}:${scryptSaltIndex}`);

export function decrypt(requestBody: string, response: http.ServerResponse): [raw: string, command: AdminCommand] {
    if (requestBody.length <= 32) { // smaller than initial vector
        response.statusCode = 400;
        response.end();
        return [null, null];
    }

    let decryptedData: string;
    try {
        const key = crypto.scryptSync(codebook.slice(scryptPasswordIndex, 32), codebook.slice(scryptSaltIndex, 32), 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(requestBody.slice(0, 32), 'hex'));
        const decryptedChunks: Buffer[] = [];
        decipher.on('data', chunk => decryptedChunks.push(Buffer.from(chunk)));
        decipher.write(requestBody.slice(32), 'hex');
        decipher.end();
        decryptedData = Buffer.concat(decryptedChunks).toString();
    } catch {
        response.statusCode = 400;
        response.end();
        return [null, null];
    }

    try {
        return [decryptedData, JSON.parse(decryptedData) as AdminCommand];
    } catch {
        response.statusCode = 400;
        response.end();
        return [null, null];
    }
}
