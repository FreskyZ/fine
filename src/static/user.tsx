/** @jsxImportSource @emotion/react */
import { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { css } from '@emotion/react';
import type { UserCredential, UserSession } from '../shared/auth.js';

// // this was only for last access time display, add back if have more usage
// import dayjs from 'dayjs';
// import utc from 'dayjs/plugin/utc.js';
// import timezone from 'dayjs/plugin/timezone.js';
// dayjs.extend(utc);
// dayjs.extend(timezone);

// not in react root elements
const titleElement = document.querySelector<HTMLSpanElement>('span#subtitle2');
const notificationElement = document.querySelector<HTMLSpanElement>('span#the-notification');

let notificationTimer: any;
function notification(message: string) {
    if (notificationTimer) {
        clearTimeout(notificationTimer);
    }
    notificationElement.style.display = 'inline';
    notificationElement.innerText = message;
    notificationTimer = setTimeout(() => {
        notificationElement.style.display = 'none';
    }, 5000);
}

function getAuthorizationHeader() {
    return { 'authorization': 'Bearer ' + localStorage['access-token'] };
}

function SignInTab({ handleSignUp, handleComplete }: {
    handleComplete: (user: UserCredential) => void,
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
            return notification('User name or password cannot be empty.');
        }

        setLoading(true);
        const response = await fetch(`https://api.example.com/signin`, {
            method: 'POST',
            headers: { 'authorization': 'Basic ' + btoa(`${username}:${password}`) },
        });
        if (response.status == 200) {
            localStorage['access-token'] = (await response.json()).accessToken;
            notification('Sign in successfully.');
            await returnToApplicationIfRequired();
            const userCredentialResponse = await fetch(`https://api.example.com/user-credential`, { headers: getAuthorizationHeader() });
            if (userCredentialResponse.status == 200) {
                handleComplete(await userCredentialResponse.json());
            } else {
                return notification('Something went wrong. (1)');
            }
        } else if (response.status == 400) {
            setLoading(false);
            return notification((await response.json()).message);
        } else {
            return notification('Something went wrong. (2)');
        }
    };

    const handleTrySignUp = async () => {
        if (!allowSignUp) {
            return notification('Sign up not allowed for now, I guess.');
        }
        handleSignUp();
    }

    return <>
        <input type="text" css={styles.input} required={true} placeholder="User name" disabled={loading} value={username} 
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <input type="password" css={styles.input} required={true} placeholder="Password" disabled={loading} value={password} 
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <button css={styles.button} disabled={loading} onClick={handleSignIn}>SIGN IN</button>
        <button css={styles.button} disabled={loading} onClick={handleTrySignUp}>SIGN UP</button>
    </>;
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
        background: 'transparent',
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
        cursor: 'pointer',
    }),
});

function SignUpTab({ handleSignIn, handleComplete }: {
    handleSignIn: () => void,
    handleComplete: (user: UserCredential) => void,
}) {
    const styles = useMemo(createSignUpTabStyles, []);
    
    const [loading, setLoading] = useState(false);
    const [username, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [secret, setSecret] = useState<{ secret: string, dataurl: string }>(null);

    const handleGetSecret = async () => {
        if (!username) { return notification('User name cannot be empty.'); }

        setLoading(true);
        const response = await fetch(
            `https://api.example.com/signup/${username}`);
        if (response.status == 200) {
            setLoading(false);
            setSecret(await response.json());
        } else if (response.status == 400) {
            setLoading(false);
            return notification((await response.json()).message);
        } else if (response.status != 200) {
            return notification('Something went wrong. (3)');
        }
    };

    const handleSignUp = async () => {
        if (!username || !password) { return notification('User name or password cannot be empty.'); }

        setLoading(true);
        const response = await fetch(`https://api.example.com/signup`, {
            method: 'POST',
            headers: { 'authorization': 'Basic ' + btoa(`${username}:${secret.secret}:${password}`) },
        });
        if (response.status == 201) {
            localStorage['access-token'] = (await response.json()).accessToken;
            notification('Sign up successfully.');
            const userCredentialResponse = await fetch(`https://api.example.com/user-credential`, { headers: getAuthorizationHeader() });
            if (userCredentialResponse.status == 200) {
                handleComplete(await userCredentialResponse.json());
            } else {
                return notification('Something went wrong. (1)');
            }
        } else if (response.status == 400) {
            setLoading(false);
            return notification((await response.json()).message);
        } else {
            return notification('Something went wrong. (4)');
        }
    };

    return <>
        <input type="text" css={styles.input} required={true} placeholder="User name" disabled={loading} value={username}
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleGetSecret()} />
        {username && <button css={[styles.button, styles.getSecret]}
            disabled={loading} onClick={handleGetSecret}>{secret ? 'Refresh ' : 'Load '}QR Code</button>}
        {secret && <img css={styles.image} src={secret.dataurl} />}
        {secret && <input type="password" css={styles.input} required={true}
            placeholder="Password" disabled={loading} value={password}
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignUp()}/>}
        <button css={[styles.button, styles.signIn]} disabled={loading || !!secret} onClick={handleSignIn}>BACK TO SIGN IN</button>
        <button css={[styles.button, styles.signUp]} disabled={loading} onClick={handleSignUp}>SIGN UP</button>
    </>;
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
        background: 'transparent',
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
        width: '144px',
        height: '28px',
        borderRadius: '4px',
        borderWidth: 0,
        outline: 'none',
        cursor: 'pointer',
        '&:disabled': {
            cursor: 'not-allowed',
        },
    }),
    signIn: css({
        marginTop: '20px',
        marginLeft: '20px',
        width: '144px',
    }),
    signUp: css({
        width: '100px',
        marginTop: '20px',
        marginLeft: '20px',
    }),
    getSecret: css({
        margin: '10px 90px 6px 90px',
    }),
});

function ManageTab({ user, handleSetUserName, handleSetSessionName, handleSignOutComplete }: { 
    user: UserCredential,
    handleSetUserName: (newUserName: string) => void,
    handleSetSessionName: (newSessionName: string) => void, 
    handleSignOutComplete: () => void,
}) {
    const styles = useMemo(createManageTabStyles, []);

    const [userName, setUserName] = useState<string>(user.name);
    const [userNameEditing, setUserNameEditing] = useState(false);
    const [userNameLoading, setUserNameLoading] = useState(false);
    const [sessionName, setSessionName] = useState<string>(user.sessionName);
    const [sessionNameEditing, setSessionNameEditing] = useState(false);
    const [sessionNameLoading, setSessionNameLoading] = useState(false);

    const [sessions, setSessions] = useState<UserSession[]>([]);
    const [sessionRemoving, setSessionRemoving] = useState(false);
    const [signingOut, setSigningOut] = useState(false);

    useEffect(() => { (async() => {
        const response = await fetch('https://api.example.com/user-sessions', { headers: getAuthorizationHeader() });
        if (response.status != 200) {
            return notification('Something went wrong. (5)');
        }
        const sessions: UserSession[] = await response.json();
        setSessions([sessions.find(d => d.id == user.sessionId)].concat(sessions.filter(d => d.id != user.sessionId))); // put this session on top
    })(); }, []);

    const handleUpdateUserName = async() => {
        if (!userName) { return notification('User name cannot be empty.'); }

        setUserNameLoading(true);
        const response = await fetch(`https://api.example.com/user-credential`, {
            method: 'PATCH',
            headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/json', },
            body: JSON.stringify({ name: userName }),
        });
        if (response.status == 201) {
            setUserNameLoading(false);
            setUserNameEditing(false);
            handleSetUserName(userName);
        }
        if (response.status == 400) {
            setUserNameLoading(false);
            return notification((await response.json()).message);
        } if (response.status != 201) {
            return notification('Something went wrong. (6)');
        }
    };
    const handleUpdateSessionName = async () => {
        if (!sessionName) { return notification('Session name cannot be empty.'); }

        setSessionNameLoading(false);
        const response = await fetch(`https://api.example.com/user-sessions/${user.sessionId}`, {
            method: 'PATCH',
            headers: { ...getAuthorizationHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: sessionName }),
        });
        if (response.status == 201) {
            setSessionNameLoading(false);
            setSessionNameEditing(false);
            setSessions(sessions.map(d => d.id == user.sessionId ? { ...d, name: sessionName } : d));
            handleSetSessionName(sessionName);
        } else {
            return notification('Something went wrong. (7)');
        }
    }

    const handleRemoveSession = async (sessionId: number) => {

        if (!confirm(`Are you sure to remove session '${sessions.find(d => d.id == sessionId).name}'?`)) {
            return;
        }
        setSessionRemoving(true);
        const response = await fetch(`https://api.example.com/user-sessions/${sessionId}`, {
            method: 'DELETE',
            headers: getAuthorizationHeader(),
        });
        if (response.status == 204) {
            setSessionRemoving(false);
            setSessions(sessions.filter(d => d.id != sessionId));
        } else {
            return notification('Something went wrong. (8)');
        }
    }
    const handleSignOut = async () => {
        if (!confirm(`Are you sure to sign out?`)) {
            return;
        }

        setSigningOut(true);
        const response = await fetch(`https://api.example.com/user-sessions/${user.sessionId}`, {
            method: 'DELETE',
            headers: getAuthorizationHeader(),
        });
        if (response.status == 204) {
            localStorage.removeItem('access-token');
            handleSignOutComplete();
        } else {
            return notification('Something went wrong. (9)');
        }
    }

    return <div css={styles.tab}>
        <div css={styles.nameContainer}>
            {userNameEditing ? <>
                <label css={styles.nameLabel}>User</label>
                <input css={styles.formInput} value={userName} disabled={userNameLoading} 
                    onChange={e => setUserName(e.target.value)}
                    onKeyDown={e => e.key == 'Enter' && handleUpdateUserName()}></input>
                <button css={styles.editButton} disabled={userNameLoading} onClick={handleUpdateUserName}>OK</button>
                <button css={styles.editButton} disabled={userNameLoading} onClick={() => { setUserName(user.name); setUserNameEditing(false); }}>CANCEL</button>
            </> : <>
                <label css={styles.nameLabel}>User Name</label>
                <span css={styles.nameDisplay}>{userName}</span>
                <button css={styles.editButton} disabled={signingOut} onClick={() => setUserNameEditing(true)}>EDIT</button>
            </>}
        </div>
        <div css={styles.nameContainer}>
            {sessionNameEditing ? <>
                <label css={styles.nameLabel}>Session</label>
                <input css={styles.formInput} value={sessionName} disabled={sessionNameLoading} 
                    onChange={e => setSessionName(e.target.value)} 
                    onKeyDown={e => e.key == 'Enter' && handleUpdateSessionName()}></input>
                <button css={styles.editButton} disabled={sessionNameLoading} onClick={handleUpdateSessionName}>OK</button>
                <button css={styles.editButton} disabled={sessionNameLoading} onClick={() => { setSessionName(user.sessionName); setSessionNameEditing(false); }}>CANCEL</button>
            </> : <>
                <label css={styles.nameLabel}>Session Name</label>
                <span css={styles.nameDisplay}>{sessionName}</span>
                <button css={styles.editButton} disabled={signingOut} onClick={() => setSessionNameEditing(true)}>EDIT</button>
            </>}
        </div>
        <div css={styles.tableHeader}>Active Sessions</div>
        <table css={styles.table}>
            <thead><tr>
                <th>Name/App</th>
                <th css={styles.lastAccess}>Last Access</th>
                <th></th>
            </tr></thead>
            <tbody>{sessions.map(d => <tr>
                <td>{d.name || d.app}</td>
                <td css={styles.lastAccess}>
                    <span>{d.lastAccessTime}</span>
                    <span>{d.lastAccessAddress}</span>
                </td>
                <td>{d.id == user.sessionId
                    ? <span css={styles.currentMark}>Current</span>
                    : <button css={styles.deleteButton} disabled={sessionRemoving || signingOut} onClick={() => handleRemoveSession(d.id)}>DELETE</button>}</td>
            </tr>)}</tbody>
        </table>
        <div css={styles.signOutContainer}>
            <button css={styles.signOutButton} disabled={signingOut} onClick={handleSignOut}>SIGN OUT</button>
        </div>
    </div>;
}
const createManageTabStyles = () => ({
    tab: css({
        paddingTop: '8px'
    }),
    nameContainer: css({
        display: 'flex',
        height: '32px',
        borderTop: '1px solid lightgray',
        padding: '6px 0',
        boxSizing: 'border-box',
    }),
    nameLabel: css({
        fontSize: '14px',
        color: '#333',
        lineHeight: '20px',
    }),
    nameDisplay: css({
        marginLeft: '8px',
        lineHeight: '20px',
    }),
    formInput: css({
        width: '144px',
        height: '20px',
        marginLeft: '8px',
        borderWidth: '0 0 1px 0',
        borderColor: '#afafaf',
        background: 'transparent',
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
        height: '20px',
        marginLeft: '8px',
        border: 'none',
        background: 'none',
        outline: 'none',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: '#eee',
        },
        '&:disabled': {
            cursor: 'not-allowed',
        },
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
    currentMark: css({
        marginLeft: '12px',
    }),
    deleteButton: css({
        height: '24px',
        padding: '0 12px',
        border: 'none',
        background: 'none',
        outline: 'none',
        cursor: 'pointer',
        '&:hover': {
            backgroundColor: '#eee',
        },
        '&:disabled': {
            cursor: 'not-allowed',
        },
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
        cursor: 'pointer',
        '&:hover': {
            background: '#db6765',
        },
    }),
});

// normally root component is App, but this is not an app, so Page
function Page(props: { user: UserCredential }) {
    const [user, setUser] = useState<UserCredential>(props.user);
    const [signIn, setSignIn] = useState(true);

    // header subtitle is not in react root, control by side effect
    useEffect(() => {
        titleElement.innerText = user ? 'User Info' : signIn ? 'Sign In' : 'Sign Up';
    }, [user, signIn]);

    if (user) {
        return <ManageTab 
            user={user}
            handleSetUserName={newUserName => setUser({ ...user, name: newUserName })}
            handleSetSessionName={newSessionName => setUser({ ...user, sessionName: newSessionName })} 
            handleSignOutComplete={() => setUser(null)} />;
    } else {
        return signIn
            ? <SignInTab handleComplete={setUser} handleSignUp={() => setSignIn(false)}/>
            : <SignUpTab handleComplete={setUser} handleSignIn={() => setSignIn(true)} />
    }
}

let currentuser: UserCredential;
const userCredentialResponse = await fetch(`https://api.example.com/user-credential`, { headers: getAuthorizationHeader() });
if (userCredentialResponse.status == 200) {
    currentuser = await userCredentialResponse.json();
} else if (userCredentialResponse.status == 401) {
    localStorage.removeItem('access-token');
    currentuser = null;
} else {
    notification('Something went wrong. (10)');
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
            notification('Something went wrong. (11)');
        }
    }
}
if (currentuser?.id) {
    await returnToApplicationIfRequired();
}

createRoot(document.querySelector('main')).render(<Page user={currentuser} />);
