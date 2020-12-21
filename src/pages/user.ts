/// <reference path="../shared/types/config.d.ts" />

const inputUserName = document.querySelector('input#username') as HTMLInputElement;
const inputPassword = document.querySelector('input#password') as HTMLInputElement;
const button = document.querySelector('button#login') as HTMLButtonElement;
const span = document.querySelector('span#message') as HTMLSpanElement;
const returnAddress = new URLSearchParams(window.location.search).get("return") ?? '/'; // this already decodeURIComponent

inputUserName.onkeydown = inputPassword.onkeydown = (e) => {
    if (e.key != 'Enter') {
        span.innerText = '';
        return;
    } else {
        button.click();
        e.preventDefault();
    }
}
button.onclick = async () => {
    const [username, password] = [inputUserName.value, inputPassword.value];

    if (!username || !password) {
        span.innerText = 'username or password cannot be empty';
        return;
    }

    inputUserName.disabled = inputPassword.disabled = button.disabled = true;
    span.innerText = 'login...';
    
    const response = await fetch(`https://api.DOMAIN_NAME/login`, { method: 'POST', headers: { 'X-Name': username, 'X-Access-Token': password } });
    if (response.status == 400) {
        inputUserName.disabled = inputPassword.disabled = button.disabled = false;
        span.innerText = (await response.json()).message;
    } else if (response.status == 500) {
        inputUserName.disabled = inputPassword.disabled = button.disabled = false;
        span.innerText = 'unexpected error';
    } else {
        localStorage['access-token'] = (await response.json()).accessToken;
        window.location.href = returnAddress;
    }
};

(async () => {
    if (localStorage['access-token']) {
        const response = await fetch(`https://api.DOMAIN_NAME/user-credential`, { headers: { 'X-Access-Token': localStorage['access-token'] } });
        if (response.status == 200) {
            window.location.href = returnAddress;
        } else if (response.status == 401) {
            localStorage.removeItem('access-token');
        }
    }
})();
