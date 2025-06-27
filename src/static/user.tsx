/** @jsxImportSource @emotion/react */
import { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { css } from '@emotion/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type { UserCredential, UserSession } from '../shared/auth.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// this object will not be null when rendering any react components, if not logged in, user.id is 0
let currentuser: UserCredential;
// not in react root elements
const subtitle2 = document.querySelector<HTMLSpanElement>('span#subtitle2');
const thenotification = document.querySelector<HTMLSpanElement>('span#the-notification');

let lastCloseNotificationTimer: any;
function notification(message: string) {
    if (lastCloseNotificationTimer) {
        clearTimeout(lastCloseNotificationTimer);
    }
    thenotification.style.display = 'inline';
    thenotification.innerText = message;
    lastCloseNotificationTimer = setTimeout(() => {
        thenotification.style.display = 'none';
    }, 5000);
}

function SignInTab({ handleSignUp, handleComplete }: {
    handleComplete: () => void,
    handleSignUp: () => void,
}) {
    const styles = useMemo(createSignInTabStyles, []);

    const [loading, setLoading] = useState(false);
    const [username, setUserName] = useState('');
    const [password, setPassword] = useState('');

    let allowSignUp = false;
    useEffect(() => { (async () => {
        const response = await fetch(`https://api.example.com/signup`);
        if (response.status == 200) {
            allowSignUp = !!(await response.json()).a;
        } // ignore none 200
    })(); }, []);

    const handleSignIn = async () => {
        if (!username || !password) {
            return notification('x 用户名或密码不能是空的');
        }

        setLoading(true);
        const response = await fetch(`https://api.example.com/signin`, {
            method: 'POST',
            headers: {
                'authorization': 'Basic ' + btoa(`${username}:${password}`),
            },
        });
        if (response.status == 400) {
            setLoading(false);
            return notification('x ' + (await response.json()).message);
        } else if (response.status == 200) {
            localStorage['access-token'] = (await response.json()).accessToken;
            notification('y 登录成功');
            handleComplete();
        } else {
            return notification('x 看起来坏掉了(9)');
        }
    };

    const handleTrySignUp = async () => {
        if (!allowSignUp) {
            return notification('x 根据相关法律法规，今天不能注册，明天大概也不能');
        }
        handleSignUp();
    }

    return <div>
        <input type="text" css={styles.input} required={true} placeholder="用户名" disabled={loading} value={username} 
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <input type="password" css={styles.input} required={true} placeholder="密码" disabled={loading} value={password} 
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <button css={styles.button} disabled={loading} onClick={handleSignIn}>登录</button>
        <button css={styles.button} disabled={loading} onClick={handleTrySignUp}>注册</button>
    </div>;
}
const createSignInTabStyles = () => ({
    input: css({
        display: 'block',
        width: '100%',
        height: '28px',
        marginTop: '12px',
        borderWidth: '0 0 1px 0',
        borderColor: '#afafaf',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        '&:focus': {
            outlineWidth: 0,
            borderColor: '#3f3f3f',
        },
        '&:disabled': {
            cursor: 'not-allowed',
        },
    }),
    button: css({
        marginTop: '20px',
        marginLeft: '20px',
        width: '120px',
        height: '28px',
        borderRadius: '4px',
        borderWidth: 0,
        outline: 'none', 
    }),
});

function SignUpTab({ handleSignIn, handleComplete }: {
    handleSignIn: () => void,
    handleComplete: () => void,
}) {
    const styles = useMemo(createSignUpTabStyles, []);
    
    const [loading, setLoading] = useState(false);
    const [username, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [secret, setSecret] = useState<{ secret: string, dataurl: string }>(null);

    const handleGetSecret = async () => {
        if (!username) { return notification('x 用户名不能是空的'); }

        setLoading(true);
        const response = await fetch(
            `https://api.example.com/signup/${username}`);
        if (response.status == 400) {
            setLoading(false);
            return notification('x ' + (await response.json()).message);
        } else if (response.status != 200) {
            return notification('x 看起来坏掉了(1)');
        }
        setSecret(await response.json());
        setLoading(false);
    };

    const handleSignUp = async () => {
        if (!username || !password) { return notification('x 用户名或密码不能是空的'); }

        setLoading(true);
        const response = await fetch(`https://api.example.com/signup`, {
            method: 'POST',
            headers: {
                'authorization': 'Basic ' + btoa(`${username}:${secret.secret}:${password}`),
            },
        });
        if (response.status == 400) {
            setLoading(false);
            return notification('x ' + (await response.json()).message);
        } else if (response.status == 201) {
            localStorage['access-token'] = (await response.json()).accessToken;
            notification('注册成功');
            handleComplete();
        } else {
            setLoading(false);
            return notification('x 看起来坏掉了(2)');
        }
    
        setLoading(false);
    };

    return <div>
        <input type="text" css={styles.input} required={true} placeholder="用户名" disabled={loading} value={username} 
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleGetSecret()} />
        {username && <button css={[styles.button, styles.getSecret]} disabled={loading} onClick={handleGetSecret}>{secret ? '刷新' : '获取'}二维码</button>}
        {secret && <img css={styles.image} src={secret.dataurl} />}
        {secret && <input type="password" css={styles.input} required={true} placeholder="验证器密码" disabled={loading} value={password} 
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignUp()}/>}
        <button css={[styles.button, styles.signIn]} disabled={loading || !!secret} onClick={handleSignIn}>登录</button>
        <button css={[styles.button, styles.signIn]} disabled={loading} onClick={handleSignUp}>注册</button>
    </div>;
}
const createSignUpTabStyles = () => ({
    input: css({
        display: 'block',
        width: '100%',
        height: '28px',
        marginTop: '12px',
        borderWidth: '0 0 1px 0',
        borderColor: '#afafaf',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        '&:focus': {
            outlineWidth: 0,
            borderColor: '#3f3f3f',
        },
        '&:disabled': {
            cursor: 'not-allowed',
        },
    }),
    image: css({
        marginLeft: '52px',
    }),
    button: css({
        width: '120px',
        height: '28px',
        borderRadius: '4px',
        borderWidth: 0,
        outline: 'none',
    }),
    signIn: css({
        marginTop: '20px',
        marginLeft: '20px',
    }),
    getSecret: css({
        margin: '10px 90px 6px 90px',
    }),
});

type UserSessionF = UserSession & { lastTimeF: dayjs.Dayjs };
function getAuthorizationHeader() { return { 'authorization': 'Bearer ' + localStorage['access-token'] }; }

function ManageTab({ user, handleSetUserName, handleSetSessionName, handleSignOutComplete }: { 
    user: UserCredential,
    handleSetUserName: (newUserName: string) => void,
    handleSetSessionName: (newSessionName: string) => void, 
    handleSignOutComplete: () => void,
}) {
    const styles = useMemo(createManageTabStyles, []);

    const [username, setUserName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.name, editing: false, loading: false });
    const [sessionName, setSessionName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.sessionName, editing: false, loading: false });
    const [sessions, setSessions] = useState<UserSessionF[]>([]);
    const [removingSession, setRemovingSession] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => { (async() => {
        const response = await fetch('https://api.example.com/user-sessions', { headers: { ...getAuthorizationHeader() } });
        if (response.status != 200) {
            return notification('x 看起来坏掉了(3)');
        }
        const sessions: UserSession[] = (await response.json());
        const sessionsf = sessions.map<UserSessionF>(d => ({ ...d, lastTimeF: dayjs.utc(d.lastAccessAddress) }));
        setSessions([sessionsf.find(d => d.id == user.sessionId)].concat(sessionsf.filter(d => d.id != user.sessionId))); // put this session on top
    })(); }, []);

    const handleUpdateUserName = async() => {
        if (!username.value) { return notification('x 用户名不能为空'); }

        setUserName({ ...username, loading: true });
        const response = await fetch(
            `https://api.example.com/user-credential`,
            { method: 'PATCH', headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/json', }, body: JSON.stringify({ name: username.value }) });
        if (response.status == 400) {
            setUserName({ ...username, loading: false });
            return notification('x ' + (await response.json()).message);
        } if (response.status != 201) {
            setUserName({ ...username, loading: false });
            return notification('x 看起来坏掉了(4)');
        }

        handleSetUserName(username.value);
        setUserName({ ...username, editing: false, loading: false });
    };
    const handleUpdateSessionName = async () => {
        if (!sessionName.value) { return notification('x 对话名不能为空'); }

        setSessionName({ ...sessionName, loading: true });
        const response = await fetch(
            `https://api.example.com/user-sessions/${user.sessionId}`, 
            { method: 'PATCH', headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: sessionName.value }) });
        if (response.status != 201) {
            setSessionName({ ...sessionName, loading: false });
            return notification('x 看起来坏掉了(5)');
        }

        handleSetSessionName(sessionName.value);
        setSessionName({ ...sessionName, editing: false, loading: false });
        setSessions(sessions.map<UserSessionF>(d => d.id == user.sessionId ? { ...d, name: sessionName.value } : d));
    }
    const handleRemoveSession = async (sessionId: number) => {
        if (!confirm(`你确定要删除“${sessions.find(d => d.id == sessionId).name}”吗？`)) { return; }

        setRemovingSession(true);
        const response = await fetch(
            `https://api.example.com/user-sessions/${sessionId}`,
            { method: 'DELETE', headers: { ...getAuthorizationHeader() } });
        if (response.status != 204) {
            return notification('x 看起来坏掉了(6)');
        }
        setSessions(sessions.filter(d => d.id != sessionId));
        setRemovingSession(false);
    }
    const handleLogOut = async () => {
        if (!confirm(`你确定要退出登录吗？`)) { return; }

        setSigningOut(true);
        const response = await fetch(
            `https://api.example.com/user-sessions/${user.sessionId}`,
            { method: 'DELETE', headers: { ...getAuthorizationHeader() } });
        if (response.status != 204) {
            setSigningOut(false);
            return notification('x 看起来坏掉了(7)');
        }
        localStorage.removeItem('access-token');
        handleSignOutComplete();
    }

    return <div css={styles.tab}>
        <div css={styles.formItem}>
            <label>用户名</label>
            {username.editing ? <>
                <input css={styles.formInput} value={username.value} disabled={username.loading} 
                    onChange={e => setUserName({ ...username, value: e.target.value })}
                    onKeyDown={e => e.key == 'Enter' && handleUpdateUserName()}></input>
                <button css={styles.editButton} disabled={username.loading} onClick={handleUpdateUserName}>确认</button>
                <button css={styles.editButton} disabled={username.loading} onClick={() => setUserName({ ...username, value: user.name, editing: false })}>取消</button>
            </> : <>
                <span css={styles.formDisplay}>{username.value}</span>
                <button css={styles.editButton} disabled={signingOut} onClick={() => setUserName({ ...username, editing: true })}>编辑</button>
            </>}
        </div>
        <div css={styles.formItem}>
            <label>对话名</label>
            {sessionName.editing ? <>
                <input css={styles.formInput} value={sessionName.value} disabled={sessionName.loading} 
                    onChange={e => setSessionName({ ...sessionName, value: e.target.value })} 
                    onKeyDown={e => e.key == 'Enter' && handleUpdateSessionName()}></input>
                <button css={styles.editButton} disabled={sessionName.loading} onClick={handleUpdateSessionName}>确认</button>
                <button css={styles.editButton} disabled={sessionName.loading} onClick={() => setSessionName({ ...sessionName, value: user.sessionName, editing: false })}>取消</button>
            </> : <>
                <span css={styles.formDisplay}>{sessionName.value}</span>
                <button css={styles.editButton} disabled={signingOut} onClick={() => setSessionName({ ...sessionName, editing: true })}>编辑</button>
            </>}
        </div>
        <div css={styles.tableHeader}>已登录对话</div>
        <table css={styles.table}>
            <thead><tr>
                <th>名字/应用</th>
                <th css={styles.lastAccess}>上次访问</th>
                <th></th>
            </tr></thead>
            <tbody>{sessions.map(d => <tr>
                <td>{d.name || d.app}</td>
                <td css={styles.lastAccess}>
                    <span>{d.lastTimeF.tz().format('YYYY-MM-DD HH:mm:ss')}</span>
                    <span>{d.lastAccessAddress}</span>
                </td>
                <td>{d.id == user.sessionId
                    ? <span>当前对话</span>
                    : <button css={styles.tableButton} disabled={removingSession || signingOut} onClick={() => handleRemoveSession(d.id)}>删除</button>}</td>
            </tr>)}</tbody>
        </table>
        <div css={styles.signOutContainer}>
            <button css={styles.signOutButton} disabled={signingOut} onClick={handleLogOut}>退出登录</button>
        </div>
    </div>;
}
const createManageTabStyles = () => ({
    tab: css({
        paddingTop: '8px'
    }),
    formItem: css({
        display: 'flex',
        height: '32px',
        paddingTop: '4px',
        borderTop: '1px solid lightgray',
    }),
    formDisplay: css({
        marginLeft: '8px',
    }),
    formInput: css({
        width: '160px',
        height: '22px',
        marginLeft: '8px',
        borderWidth: '0 0 1px 0',
        borderColor: '#afafaf',
        borderTopLeftRadius: '4px',
        borderTopRightRadius: '4px',
        '&:focus': {
            outlineWidth: 0,
            borderColor: '#3f3f3f',
        },
        '&:disabled': {
            cursor: 'not-allowed',
        },
    }),
    editButton: css({
        height: '24px',
        marginLeft: '8px',
        border: 'none',
        background: 'none',
        outline: 'none',
    }),
    tableHeader: css({
        paddingTop: '4px',
        borderTop: '1px solid lightgray',
    }),
    table: css({
        marginBottom: '4px',
        fontSize: '12px',
        'tr': {
            borderRadius: '4px',
            '&:hover': {
                backgroundColor: '#f4f4f4',
            },
        },
        'td': {
            padding: '2px 4px',
        },
    }),
    lastAccess: css({
        width: '160px',
        'span': {
            display: 'block',
        },
    }),
    tableButton: css({
        height: '24px',
        padding: '0 12px',
        border: 'none',
        background: 'none',
        outline: 'none',
    }),
    signOutContainer: css({
        paddingTop: '4px',
        borderTop: '1px solid lightgray',
    }),
    signOutButton: css({
        display: 'block',
        height: '29px',
        width: '90px',
        border: 'none',
        background: '#c73b3d',
        outline: 'none',
        color: 'white',
        '&:hover': {
            background: '#db6765',
        },
    }),
});

// normally root component is App, but this is not an app, so Page
function Page() {
    const [tab, setTab] = useState<'signin' | 'signup' | 'manage'>(() => currentuser.id ? 'manage' : 'signin');
    const [user, setUser] = useState<UserCredential | null>(null);

    // header subtitle is not in react root, control by side effect
    useEffect(() => {
        subtitle2.innerText = tab == 'signin' ? '登录' : tab == 'signup' ? '注册' : '用户设置';
    }, [tab]);

    switch (tab) {
        case 'signin': return <SignInTab 
            handleComplete={getUserCredential} 
            handleSignUp={() => setTab('signup')}/>;
        case 'signup': return <SignUpTab 
            handleComplete={getUserCredential} 
            handleSignIn={() => setTab('signin')} />
        case 'manage': return <ManageTab 
            user={user}
            handleSetUserName={newUserName => setUser({ ...user, name: newUserName })}
            handleSetSessionName={newSessionName => setUser({ ...user, sessionName: newSessionName })} 
            handleSignOutComplete={() => setTab('signin')} />;
    }
}

currentuser = null;
const userCredentialResponse = await fetch(`https://api.example.com/user-credential`, { headers: getAuthorizationHeader() });
if (userCredentialResponse.status == 200) {
    currentuser = await userCredentialResponse.json();
} else if (userCredentialResponse.status == 401) {
    localStorage.removeItem('access-token');
    currentuser = { id: 0, name: '' };
} else {
    notification('x 不知道什么东西坏掉了(8)');
}

// also called in sign in page
async function returnToApplicationIfRequired() {
    const returnAddress = new URLSearchParams(window.location.search).get('return');
    if (returnAddress) {
        const authorizationCodeResponse = await fetch(`https://api.example.com/generate-authorization-code`, {
            method: 'POST',
            headers: getAuthorizationHeader(),
            body: JSON.stringify({ return: returnAddress }),
        });
        if (authorizationCodeResponse.status == 200) {
            // replace: do not go back to here
            window.location.replace(returnAddress);
        } else {
            notification('x 不知道什么东西坏掉了(9)');
        }
    }
}
if (currentuser.id) {
    await returnToApplicationIfRequired();
}



createRoot(document.querySelector('main')).render(<Page />);
