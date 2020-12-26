import React from 'react';
import ReactDOM from 'react-dom';
import { Select, Input, InputNumber } from 'antd';
import type { Change } from '../api';
import * as api from './api';

function ChangeRow({ change, handleChange }: { change: Change, handleChange: () => any }) {
    return <div className='change-row'>
        <Select className='change-type' value={change.type} onChange={(newValue: Change['type']) => { change.type = newValue; handleChange(); }}>
            <Select.Option value='expend'>Expend</Select.Option>
            <Select.Option value='income'>Income</Select.Option>
        </Select>
        <Input className='change-name' value={change.name} onChange={e => { change.name = e.target.value; handleChange(); }}/>
        <InputNumber className='change-value' value={change.value} onChange={newValue => { change.value = newValue as number; handleChange(); }} />
        <span className='change-time--'>{change.time}</span>
    </div>;
}

function App() {
    const [changes, setChanges] = React.useState<Change[]>([]);

    React.useEffect(() => {
        api.getChanges().then(setChanges);
    }, []);

    const handleChange = () => {
        setChanges([...changes]);
    };

    return <>
        {changes.map((change, index) => 
            <ChangeRow key={index} change={change} handleChange={handleChange} />)}
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));
