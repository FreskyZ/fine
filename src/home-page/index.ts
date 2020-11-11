
interface Moment {
    format(f: string): string;
}
interface MomentModule {
    (): Moment;
}
declare var moment: MomentModule;

interface UserCredential {
    id: string;
    loginId: string;
    name: string;
}
interface State {
    modalVisible: boolean,
    credential: UserCredential | null, // has credential means logged in
}

async function getUserInfo(): Promise<UserCredential> {
    const response = await fetch('/user-info', { headers: { 'Authorization': localStorage['token'] } });
    const body = await response.json();
    return body as UserCredential;
}
async function initialize(): Promise<State> {
    return {
        modalVisible: false,
        credential: localStorage['token'] ? await getUserInfo() : null, // has credential means logged in
    };
}

const ui = {
    'date': document.querySelector('span#date')! as HTMLSpanElement,
    'who-btn': document.querySelector('div#who-btn')! as HTMLButtonElement,
    'who-btn-line-2': document.querySelector('div#who-btn>span.line-2')! as HTMLSpanElement,
    'where-btn-line-2': document.querySelector('div#where-btn>span.line-2')! as HTMLSpanElement,
    'modal-mask': document.querySelector('div#modal-mask')! as HTMLDivElement,
    'modal-username': document.querySelector('input#username')! as HTMLInputElement,
    'modal-password': document.querySelector('input#password')! as HTMLInputElement,
    'modal-cancel': document.querySelector('button#cancel')! as HTMLButtonElement,
    'modal-login': document.querySelector('button#login')! as HTMLButtonElement,
}

ui['date'].innerText = moment().format('YY-M-D');
ui['where-btn-line-2'].innerText = 'geolocation service not available';
navigator.geolocation.getCurrentPosition(({ coords }) => {
    ui['where-btn-line-2'].innerText =
        `${+coords.latitude.toFixed(6)}N, ${+coords.longitude.toFixed(6)}E, accuracy ${Math.round(coords.accuracy)}m`;
}, ({ message }) => {
    ui['where-btn-line-2'].innerText = 'geolocation service error';
    console.log('geolocation error: ' + message);
}, { enableHighAccuracy: true });

ui['who-btn'].onclick = function(): void {
    ui['modal-username'].value = '';
    ui['modal-password'].value = '';
    state.modalVisible = true;
    render();
}

ui['modal-cancel'].onclick = function(): void {
    state.modalVisible = false;
    render();
}

async function handleLogIn(): Promise<void> {
    const username = ui['modal-username'].value;
    const password = ui['modal-password'].value;

    if (username.length == 0 || password.length == 0) {
        alert('user name or password cannot be empty');
        return;
    }

    const response = await fetch('/token', { method: 'POST', body: JSON.stringify({ username, password }) });
    const body = await response.json();
    const token = (body as { token: string }).token;

    localStorage['token'] = token;

    ui['modal-username'].value = '';
    ui['modal-password'].value = '';
    state.modalVisible = false;
    state.credential = await getUserInfo();
    render();
}
ui['modal-login'].onclick = async () => await handleLogIn();
ui['modal-username'].onkeypress = ui['modal-password'].onkeypress = async function(e) {
    if (e.keyCode == 13) {
        e.preventDefault();
        await handleLogIn();
    }
}

function render() {
    const { modalVisible, credential } = state;

    if (credential != null) {
        ui['who-btn-line-2'].innerText = 'logged in as ' + credential.name;
    } else {
        ui['who-btn'].style.cursor = 'pointer';
        ui['who-btn-line-2'].innerText = 'login';
    }

    ui['modal-mask'].style.display = modalVisible ? 'block' : 'none';
}

let state: State;
initialize().then(s => {
    state = s;
    render();
});

