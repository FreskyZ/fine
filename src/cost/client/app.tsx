import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { useState, useEffect } from 'react';

interface ComponentProps {
    value: string;
}
function Component1({ value }: ComponentProps) {
    
    useEffect(() => {
        console.log('normal effect 1, all updates');
        return () => {
            console.log('return value of normal effect 1');
        };
    });
    useEffect(() => {
        console.log('once effect 1, now seems only component did mount');
        return () => {
            console.log('return value of once effect 1');
        };
    }, []);
    useEffect(() => {
        console.log('value effect 1, should only be called when value change');
        return () => {
            console.log('return value of value effect 1');
        };
    }, [value]);

    return <div>component 1 value: {value}</div>;
}
function Component2({ value }: ComponentProps) {
    
    useEffect(() => {
        console.log('normal effect 2, all updates');
    });
    useEffect(() => {
        console.log('once effect 2, now seems only component did mount');
    }, []);
    useEffect(() => {
        console.log('value effect 2, should be only changed when value change');
    }, [value]);

    return <div>component 2 value: {value}</div>;
}

function App() {
    const [key, setKey] = useState('0');
    const [value, setValue] = useState('input something');

    return <>
        <h4><a href='/'>/home/fresky</a>/where-is-my-money</h4>
        <label>key: </label><input type='text' value={key} onChange={e => setKey(e.target.value)}/>
        <label>value: </label><input type='text' value={value} onChange={e => setValue(e.target.value)}/>
        {key.length < 3 ? <Component1 value={value}/> : <Component2 value={value}/>}
    </>;
}

ReactDOM.render(<App/>, document.getElementById('root'));

