/** @jsxImportSource @emotion/react */
// @ts-ignore, vscode want this, ask them to add more no-config-config settings
import { useState, useEffect, useMemo } from 'react'; // https://esm.sh/react
import { createRoot } from 'react-dom/client';
import { css } from '@emotion/react';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';
import type { UserCredential, UserDevice } from '../shared/auth.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// not in react root elements
const subtitle2 = document.querySelector('span#subtitle2') as HTMLSpanElement;
const thenotification = document.querySelector('span#the-notification') as HTMLSpanElement;

type Tab = 
    | 'initial' // displays 'loading', transfer to signin if no user credential, transfer to manage if have user credential
    | 'signin'  // transfer to signup by click button, transfer to manage by sign in success
    | 'signup'  // transfer to signin by click button, transfer to manage by sign up success
    | 'manage'; // transfer to signin by click logout

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

function InitialTab() {
    const styles = useMemo(createInitialTabStyles, []);
    return <div css={styles.loading}>还在加载</div>;
}
const createInitialTabStyles = () => ({
    loading: css({ textAlign: 'center', marginTop: '32px', fontSize: '18px' }),
});

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
        const response = await fetch(`https://api.example.com/signin`, { method: 'POST', headers: { 'X-Name': username, 'X-Token': password } });
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
        const response = await fetch(
            `https://api.example.com/signup`,
            { method: 'POST', headers: { 'X-Name': username, 'X-Token': `${secret.secret}:${password}` } });
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

type UserDeviceF = UserDevice & { lastTimeF: dayjs.Dayjs };
function ManageTab({ user, handleSetUserName, handleSetDeviceName, handleLogOut: handleLogOutComplete }: { 
    user: UserCredential,
    handleSetUserName: (newUserName: string) => void,
    handleSetDeviceName: (newDeviceName: string) => void, 
    handleLogOut: () => void,
}) {
    const styles = useMemo(createManageTabStyles, []);

    const [username, setUserName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.name, editing: false, loading: false });
    const [deviceName, setDeviceName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.deviceName, editing: false, loading: false });
    const [devices, setDevices] = useState<UserDeviceF[]>([]);
    const [removingDevice, setRemovingDevice] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => { (async() => {
        const response = await fetch('https://api.example.com/user-devices', { headers: { 'X-Token': localStorage['access-token'] } });
        if (response.status != 200) {
            return notification('x 看起来坏掉了(3)');
        }
        const devices = (await response.json()) as UserDevice[];
        const devicesf = devices.map<UserDeviceF>(d => ({ ...d, lastTimeF: dayjs.utc(d.lastTime) }));
        setDevices([devicesf.find(d => d.id == user.deviceId)].concat(devicesf.filter(d => d.id != user.deviceId))); // put this device on top
    })(); }, []);

    const handleUpdateUserName = async() => {
        if (!username.value) { return notification('x 用户名不能为空'); }

        setUserName({ ...username, loading: true });
        const response = await fetch(
            `https://api.example.com/user-credential`,
            { method: 'PATCH', headers: { 'X-Token': localStorage['access-token'], 'Content-Type': 'application/json', }, body: JSON.stringify({ name: username.value }) });
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
    const handleUpdateDeviceName = async () => {
        if (!deviceName.value) { return notification('x 设备名不能为空'); }

        setDeviceName({ ...deviceName, loading: true });
        const response = await fetch(
            `https://api.example.com/user-devices/${user.deviceId}`, 
            { method: 'PATCH', headers: { 'X-Token': localStorage['access-token'], 'Content-Type': 'application/json' }, body: JSON.stringify({ name: deviceName.value }) });
        if (response.status != 201) {
            setDeviceName({ ...deviceName, loading: false });
            return notification('x 看起来坏掉了(5)');
        }

        handleSetDeviceName(deviceName.value);
        setDeviceName({ ...deviceName, editing: false, loading: false });
        setDevices(devices.map<UserDeviceF>(d => d.id == user.deviceId ? { ...d, name: deviceName.value } : d));
    }
    const handleRemoveDevice = async (deviceId: number) => {
        if (!confirm(`你确定要删除“${devices.find(d => d.id == deviceId).name}”吗？`)) { return; }

        setRemovingDevice(true);
        const response = await fetch(
            `https://api.example.com/user-devices/${deviceId}`,
            { method: 'DELETE', headers: { 'X-Token': localStorage['access-token'] } });
        if (response.status != 204) {
            return notification('x 看起来坏掉了(6)');
        }
        setDevices(devices.filter(d => d.id != deviceId));
        setRemovingDevice(false);
    }
    const handleLogOut = async () => {
        if (!confirm(`你确定要退出登录吗？`)) { return; }

        setLoggingOut(true);
        const response = await fetch(
            `https://api.example.com/user-devices/${user.deviceId}`,
            { method: 'DELETE', headers: { 'X-Token': localStorage['access-token'] } });
        if (response.status != 204) {
            setLoggingOut(false);
            return notification('x 看起来坏掉了(7)');
        }
        localStorage.removeItem('access-token');
        handleLogOutComplete();
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
                <button css={styles.editButton} disabled={loggingOut} onClick={() => setUserName({ ...username, editing: true })}>编辑</button>
            </>}
        </div>
        <div css={styles.formItem}>
            <label>设备名</label>
            {deviceName.editing ? <>
                <input css={styles.formInput} value={deviceName.value} disabled={deviceName.loading} 
                    onChange={e => setDeviceName({ ...deviceName, value: e.target.value })} 
                    onKeyDown={e => e.key == 'Enter' && handleUpdateDeviceName()}></input>
                <button css={styles.editButton} disabled={deviceName.loading} onClick={handleUpdateDeviceName}>确认</button>
                <button css={styles.editButton} disabled={deviceName.loading} onClick={() => setDeviceName({ ...deviceName, value: user.deviceName, editing: false })}>取消</button>
            </> : <>
                <span css={styles.formDisplay}>{deviceName.value}</span>
                <button css={styles.editButton} disabled={loggingOut} onClick={() => setDeviceName({ ...deviceName, editing: true })}>编辑</button>
            </>}
        </div>
        <div css={styles.tableHeader}>已登录设备</div>
        <table css={styles.table}>
            <thead><tr>
                <th>名字</th>
                <th css={styles.lastAccess}>上次访问</th>
                <th></th>
            </tr></thead>
            <tbody>{devices.map(d => <tr>
                <td>{d.name}</td>
                <td css={styles.lastAccess}>
                    <span>{d.lastTimeF.tz().format('YYYY-MM-DD HH:mm:ss')}</span>
                    <span>{d.lastAddress}</span>
                </td>
                <td>{d.id == user.deviceId
                    ? <span>当前设备</span>
                    : <button css={styles.tableButton} disabled={removingDevice || loggingOut} onClick={() => handleRemoveDevice(d.id)}>删除</button>}</td>
            </tr>)}</tbody>
        </table>
        <div css={styles.signOutContainer}>
            <button css={styles.signOutButton} disabled={loggingOut} onClick={handleLogOut}>退出登录</button>
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
    const [tab, setTab] = useState<Tab>('initial');
    const [user, setUser] = useState<UserCredential | null>(null);

    // header subtitle is not in react root, control by side effect
    useEffect(() => {
        subtitle2.style.display = tab != 'initial' ? 'inline' : 'none';
        subtitle2.innerText = tab == 'initial' ? '' : tab == 'signin' ? '登录' : tab == 'signup' ? '注册' : '用户设置';
    }, [tab]);

    // initial fetch user-credential
    const getUserCredential = async () => {
        const response = await fetch(
            `https://api.example.com/user-credential`, 
            { headers: { 'X-Token': localStorage['access-token'] }});
        if (response.status == 200) {
            setUser(await response.json());
            setTab('manage');
        } else if (response.status == 401) {
            localStorage.removeItem('access-token');
            setTab('signin');
        } else {
            return notification('x 看起来坏掉了(8)');
        }
    };
    useEffect(() => { /* ATTENTION do not await because useEffect does not accept this and async hook is designed to be use in this way */ getUserCredential(); }, []);

    switch (tab) {
        case 'initial': return <InitialTab />;
        case 'signin': return <SignInTab 
            handleComplete={getUserCredential} 
            handleSignUp={() => setTab('signup')}/>;
        case 'signup': return <SignUpTab 
            handleComplete={getUserCredential} 
            handleSignIn={() => setTab('signin')} />
        case 'manage': return <ManageTab 
            user={user}
            handleSetUserName={newUserName => setUser({ ...user, name: newUserName })}
            handleSetDeviceName={newDeviceName => setUser({ ...user, deviceName: newDeviceName })} 
            handleLogOut={() => setTab('signin')} />;
    }
}

createRoot(document.querySelector('main')).render(<Page />);
