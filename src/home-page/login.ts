/// <reference path="../shared/types/config.d.ts" />
import type { UserCredential } from '../shared/types/auth';

const inputUserName = document.querySelector('input#username') as HTMLInputElement;
const inputPassword = document.querySelector('input#password') as HTMLInputElement;
const button = document.querySelector('button#login') as HTMLButtonElement;
const span = document.querySelector('span#message') as HTMLSpanElement;

inputUserName.onkeydown = inputPassword.onkeydown = () => {
    span.innerText = '';
}
button.onclick = async () => {
    const [username, password] = [inputUserName.value, inputPassword.value];

    if (!username || !password) {
        span.innerText = 'username or password cannot be empty';
        return;
    }

    inputUserName.disabled = inputPassword.disabled = button.disabled = true;
    span.innerText = 'login...';
    
    const response = await fetch(`https://api.${DOMAIN_NAME}/login`, { method: 'POST', headers: { 'X-Name': username, 'X-Access-Token': password } });
    if (response.status == 400) {
        inputUserName.disabled = inputPassword.disabled = button.disabled = false;
        span.innerText = (await response.json()).message;
    } else if (response.status == 500) {
        inputUserName.disabled = inputPassword.disabled = button.disabled = false;
        span.innerText = 'unexpected error';
    } else {
        localStorage['access-token'] = (await response.json()).accessToken;
        window.location.href = '/'; // TODO goto previous page
    }
};

(async () => {
    if (localStorage['access-token']) {
        const response = await fetch(`https://api.${DOMAIN_NAME}/user-credential`, { headers: { 'X-Access-Token': localStorage['access-token'] } });
        if (response.status == 200) {
            const user = await response.json() as UserCredential;
            inputUserName.disabled = inputPassword.disabled = button.disabled = true;
            span.innerHTML = `logged in as ${user.name}, goto <a href="/">home page</a>`;
        }
    }
})();
