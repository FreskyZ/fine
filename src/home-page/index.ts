// import type * as dayjs from 'dayjs';
import { UserCredential } from '../shared/types/auth';

const ue = { // ui elements
    'signin': document.querySelector('span#signin-or-username')! as HTMLSpanElement,
    'app-container': document.querySelector('div#app-container')! as HTMLDivElement,
    'login-container': document.querySelector('div#login-container')! as HTMLDivElement,
    'input-username': document.querySelector('input#username')! as HTMLInputElement,
    'input-password': document.querySelector('input#password')! as HTMLInputElement,
    'login-btn': document.querySelector('button#login-btn') as HTMLButtonElement,
    'loading': document.querySelector('span#loading')! as HTMLSpanElement,
}

let loading = false;
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
        return alert('user name or password cannot be empty');
    }

    loading = true;
    render();

    const response = await fetch('https://api.domain.com/login', { 
        method: 'POST', 
        body: JSON.stringify({ name: username, password }),
        headers: { 'Content-Type': 'application/json' },
    });
    if (response.status == 400) {
        const { message } = await response.json();
        return alert(message);
    } 
    if (response.status == 500) {
        const { message } = await response.json();
        return alert(message);
    }

    tab = 'app';
    user = await response.json() as UserCredential;
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

    ue['loading'].style.display = loading ? 'inline-block' : 'none';
}
render(); // initial render

async function fetchWithRefreshRetry<T>(path: string, init?: RequestInit): Promise<T> {
    const normalResponse = await fetch('https://api.domain.com' + path, init);
    if (normalResponse.status == 401) {
        const refreshResponse = await fetch('https://api.domain.com/refresh-token', { method: 'POST' });
        if (refreshResponse.status == 401) {
            throw new Error('401'); // true not authorized
        } else if (!refreshResponse.ok) {
            alert('unknown response');
            throw new Error('unknown response');
        }
        const normalResponse2 = await fetch('https://api.domain.com' + path, init);
        return await normalResponse2.json();
    } else if (!normalResponse.ok) {
        alert('unknown response');
        throw new Error('unknown response');
    } else {
        return await normalResponse.json();
    }
}

async function initialize(): Promise<void> {
    try {
        user = await fetchWithRefreshRetry<UserCredential>('/user-credential', { credentials: 'include' });
    } catch {
        user = null;
    }
    render();
}
initialize(); // async component did mount
