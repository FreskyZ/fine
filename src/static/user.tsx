// @ts-ignore, vscode want this, ask them to add more no-config-config settings
import React from 'react';
import { FC, useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import type { UserCredential, UserDevice } from '../shared/auth';

// not in react root elements
const subtitle2 = document.querySelector('span#subtitle2') as HTMLSpanElement;
const thenotification = document.querySelector('span#the-notification') as HTMLSpanElement;

declare global {
    interface DayjsPlugin { } // markup type
    interface Dayjs {
        extend: (plugin: DayjsPlugin) => void,
        utc: (v: string) => Dayjs,
        format: (f: string) => string,
        tz: (z?: string) => Dayjs,
    }
    const dayjs: Dayjs;
    const dayjs_plugin_utc: DayjsPlugin;
    const dayjs_plugin_timezone: DayjsPlugin;
    type UserDeviceF = UserDevice & { lastTimeF: Dayjs };
}
dayjs.extend(dayjs_plugin_utc);
dayjs.extend(dayjs_plugin_timezone);

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

const InitialTab: FC<{}> = () => {
    return <div className='initial-loading'>还在加载</div>;
}

const SignInTab: FC<{ handleComplete: () => void, handleSignUp: () => void }> = ({ handleComplete, handleSignUp }) => {
    const [loading, setLoading] = useState(false);
    const [username, setUserName] = useState('');
    const [password, setPassword] = useState('');

    let allowSignUp = false;
    useEffect(() => { (async () => {
        const response = await fetch(`https://api.domain.com/signup`);
        if (response.status == 200) {
            allowSignUp = !!(await response.json()).a;
        } // ignore none 200
    })(); }, []);

    const handleSignIn = async () => {
        if (!username || !password) {
            return notification('x 用户名或密码不能是空的');
        }

        setLoading(true);
        const response = await fetch(`https://api.domain.com/signin`, { method: 'POST', headers: { 'X-Name': username, 'X-Token': password } });
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

    return <div className='signin-tab'>
        <input type="text" required={true} placeholder="用户名" disabled={loading} value={username} 
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <input type="password" required={true} placeholder="密码" disabled={loading} value={password} 
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignIn()} />
        <button disabled={loading} onClick={handleSignIn}>登录</button>
        <button disabled={loading} onClick={handleTrySignUp}>注册</button>
    </div>;
}

const SignUpTab: FC<{ handleSignIn: () => void, handleComplete: () => void }> = ({ handleSignIn, handleComplete }) => {
    const [loading, setLoading] = useState(false);
    const [username, setUserName] = useState('');
    const [password, setPassword] = useState('');
    const [secret, setSecret] = useState<{ secret: string, dataurl: string }>(null);

    const handleGetSecret = async () => {
        if (!username) { return notification('x 用户名不能是空的'); }

        setLoading(true);
        const response = await fetch(
            `https://api.domain.com/signup/${username}`);
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
            `https://api.domain.com/signup`,
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

    return <div className='signup-tab'>
        <input type="text" required={true} placeholder="用户名" disabled={loading} value={username} 
            onChange={e => setUserName(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleGetSecret()} />
        {username && <button className='get-secret' disabled={loading} onClick={handleGetSecret}>{secret ? '刷新' : '获取'}二维码</button>}
        {secret && <img src={secret.dataurl} />}
        {secret && <input type="password" required={true} placeholder="验证器密码" disabled={loading} value={password} 
            onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key == 'Enter' && handleSignUp()}/>}
        <button className='signin' disabled={loading || !!secret} onClick={handleSignIn}>登录</button>
        <button className='signup' disabled={loading} onClick={handleSignUp}>注册</button>
    </div>;
}

const ManageTab: FC<{ 
    user: UserCredential,
    handleSetUserName: (newUserName: string) => void,
    handleSetDeviceName: (newDeviceName: string) => void, 
    handleLogOut: () => void,
}> = ({ user, handleSetUserName, handleSetDeviceName, handleLogOut: handleLogOutComplete }) => {
    const [username, setUserName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.name, editing: false, loading: false });
    const [deviceName, setDeviceName] = useState<{ value: string, editing: boolean, loading: boolean }>({ value: user.deviceName, editing: false, loading: false });
    const [devices, setDevices] = useState<UserDeviceF[]>([]);
    const [removingDevice, setRemovingDevice] = useState(false);
    const [loggingOut, setLoggingOut] = useState(false);

    useEffect(() => { (async() => {
        const response = await fetch('https://api.domain.com/user-devices', { headers: { 'X-Token': localStorage['access-token'] } });
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
            `https://api.domain.com/user-credential`,
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
            `https://api.domain.com/user-devices/${user.deviceId}`, 
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
            `https://api.domain.com/user-devices/${deviceId}`,
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
            `https://api.domain.com/user-devices/${user.deviceId}`,
            { method: 'DELETE', headers: { 'X-Token': localStorage['access-token'] } });
        if (response.status != 204) {
            setLoggingOut(false);
            return notification('x 看起来坏掉了(7)');
        }
        localStorage.removeItem('access-token');
        handleLogOutComplete();
    }

    return <div className='manage-tab'>
        <div className='editable-item user-name'>
            <label>用户名</label>
            {username.editing ? <>
                <input value={username.value} disabled={username.loading} 
                    onChange={e => setUserName({ ...username, value: e.target.value })}
                    onKeyDown={e => e.key == 'Enter' && handleUpdateUserName()}></input>
                <button className='confirm' disabled={username.loading} onClick={handleUpdateUserName}>确认</button>
                <button className='cancel' disabled={username.loading} onClick={() => setUserName({ ...username, value: user.name, editing: false })}>取消</button>
            </> : <>
                <span>{username.value}</span>
                <button className='edit' disabled={loggingOut} onClick={() => setUserName({ ...username, editing: true })}>编辑</button>
            </>}
        </div>
        <div className='editable-item device-name'>
            <label>设备名</label>
            {deviceName.editing ? <>
                <input value={deviceName.value} disabled={deviceName.loading} 
                    onChange={e => setDeviceName({ ...deviceName, value: e.target.value })} 
                    onKeyDown={e => e.key == 'Enter' && handleUpdateDeviceName()}></input>
                <button className='confirm' disabled={deviceName.loading} onClick={handleUpdateDeviceName}>确认</button>
                <button className='cancel' disabled={deviceName.loading} onClick={() => setDeviceName({ ...deviceName, value: user.deviceName, editing: false })}>取消</button>
            </> : <>
                <span>{deviceName.value}</span>
                <button className='edit' disabled={loggingOut} onClick={() => setDeviceName({ ...deviceName, editing: true })}>编辑</button>
            </>}
        </div>
        <div className='table-header'>已登录设备</div>
        <table>
            <thead><tr>
                <th className='device-name'>名字</th>
                <th className='last-access'>上次访问</th>
                <th className='operations'></th>
            </tr></thead>
            <tbody>{devices.map(d => <tr>
                <td className='device-name'>{d.name}</td>
                <td className='last-access'>
                    <span>
                        <span className='last-time'>{d.lastTimeF.tz().format('YYYY-MM-DD HH:mm:ss')}</span>
                        <span className='last-address'>{d.lastAddress}</span>
                    </span></td>
                <td className='operations'>{d.id == user.deviceId
                    ? <span>当前设备</span>
                    : <button disabled={removingDevice || loggingOut} onClick={() => handleRemoveDevice(d.id)}>删除</button>}</td>
            </tr>)}</tbody>
        </table>
        <div className='logout-container'>
            <button disabled={loggingOut} onClick={handleLogOut}>退出登录</button>
        </div>
    </div>;
}

const Page: FC<{}> = () => {
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
            `https://api.domain.com/user-credential`, 
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

ReactDOM.createRoot(document.querySelector('main')).render(<Page />);
