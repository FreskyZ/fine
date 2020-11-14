// import type * as dayjs from 'dayjs';
import { UserCredential } from '../shared/types/auth';

const ue = { // ui elements
    'signin': document.querySelector('span#signin-or-username')! as HTMLSpanElement,
    'app-container': document.querySelector('div#app-container')! as HTMLDivElement,
    'login-container': document.querySelector('div#login-container')! as HTMLDivElement,
    'input-username': document.querySelector('input#username')! as HTMLInputElement,
    'input-password': document.querySelector('input#password')! as HTMLInputElement,
    'login-btn': document.querySelector('button#login-btn') as HTMLButtonElement,
}

let tab: 'app' | 'login' = 'app';
let user: UserCredential = null;

ue['signin'].onclick = function handleLogin() {
    tab = tab == 'app' ? 'login' : 'app';
    render();
}
ue['login-btn'].onclick = async function handleLoginSubmit() {
    const username = ue['input-username'].value;
    const password = ue['input-password'].value;

    if (username.length == 0 || password.length == 0) {
        alert('user name or password cannot be empty');
        return;
    }

    tab = 'app';
    render();
}
ue['input-password'].onkeypress = ue['input-username'].onkeypress = function handleInputChange(e: KeyboardEvent) {
    if (e.code == 'Enter') {
        e.preventDefault();
        ue['login-btn'].onclick(null);
    }
}

function render() {
    ue['signin'].innerText = tab == 'login' ? 'cancel' : user?.name ?? 'sign in';

    ue['app-container'].style.height = tab == 'app' ? '144px' : '0';
    ue['login-container'].style.height = tab == 'login' ? '178px' : '0';
}
render(); // initial render

async function initialize(): Promise<void> {
    await fetch('https://api.domain.com/user-credential');
    render();
}
initialize(); // async component did mount
