import React from 'react';
import ReactDOM from 'react-dom';
import { Select, Input, InputNumber } from 'antd';
import type { Change } from '../api';
import * as api from './api'; // abc

function ChangeRow({ change }: { change: Change }) {
    return <div className='change-row'>
        <Select className='change-type' value={change.type}>
            <Select.Option value='expend'>Expend</Select.Option>
            <Select.Option value='income'>Income</Select.Option>
        </Select>
        <Input className='change-name' value={change.name} />
        <InputNumber className='change-value' value={change.value} />
        <span className='change-time'>{change.time}</span>
    </div>;
}

function App() {
    const [changes, setChanges] = React.useState<Change[]>([]);

    React.useEffect(() => {
        api.getChanges().then(setChanges);
    }, []);

    return <>
        {changes.map((change, index) => <ChangeRow key={index} change={change}/>)}
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));
