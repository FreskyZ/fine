import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, Tag, Modal, Select, Input, InputNumber, Spin, Popconfirm, message } from 'antd';
import { CloseOutlined, EditOutlined }  from '@ant-design/icons';
import { DatePicker, TimePicker } from './dayjs-picker';
import dayjs from 'dayjs';
import type { Record } from '../api';
import * as api from './api';

type RecordRowProps = { record: Record, handleEdit: () => any, handleDeleteFinish: () => any };
const RecordRow: React.FC<RecordRowProps> = ({ record, handleEdit, handleDeleteFinish }) => {
    const [loading, setLoading] = useState(false);

    const handleDelete = () => {
        setLoading(true);
        api.deleteRecord(record.id).then(() => {
            message.info('删除成功');
            handleDeleteFinish();
        }, ex => {
            message.error('删除失败：' + ex.message);
            setLoading(false);
        });
    }

    return <div className='record-row'><Spin spinning={loading}>
        <span className='record-title'>{record.title}</span>
        <span className='record-tags'>{[record.type as string].concat(record.tags).map(tag => <Tag className='record-tag'><span>{tag}</span></Tag>)}</span>
        <span className='record-time'>{record.time}</span>
        <span className='record-amount'>&#x00A5;{record.amount}</span>
        <Button icon={<EditOutlined />} onClick={handleEdit} />
        <Popconfirm title='确定要删除这条记录吗？' onConfirm={handleDelete}>
            <CloseOutlined />
        </Popconfirm>
    </Spin></div>;
}

// TODO: try antd 4 form later
type AddModalProps = { handleFinish: (newRecord: Record) => any };
const AddModal: React.FC<AddModalProps> = ({ handleFinish }) => {
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [type, setType] = useState<Record['type']>('cost');
    const [time, setTime] = useState(dayjs());
    const [amount, setAmount] = useState(0);

    const handleSave = () => {
        setLoading(true);
        api.addRecord({ id: 0, title, type, tags: [], amount, time: time.format('YYYYMMDD-HHmmss') }).then(result => {
            message.info('保存成功');
            result.time = time.format('YYYY-MM-DD HH:mm:ss');
            handleFinish(result);
        }, ex => {
            setLoading(false);
            message.error('保存没成功：' + ex.message);
        });
    }

    return <Modal 
        title='添加记录'
        visible={true}
        maskClosable={false}
        footer={<Button loading={loading} onClick={handleSave}>保存</Button>}>
        <Input value={title} disabled={loading} onChange={e => setTitle(e.target.value)} />
        <Select value={type} disabled={loading} onChange={(newValue: Record['type']) => setType(newValue)}>
            <Select.Option value='cost'>支出</Select.Option>
            <Select.Option value='income'>收入</Select.Option>
            <Select.Option value='transfer'>转移</Select.Option>
        </Select>
        <DatePicker value={time} disabled={loading} onChange={newValue => setTime(time.year(newValue.year()).month(newValue.month()).day(newValue.day()))} />
        <TimePicker value={time} disabled={loading} onChange={newValue => setTime(time.hour(newValue.hour()).minute(newValue.minute()).day(newValue.day()))} />
        <InputNumber value={amount} disabled={loading} onChange={((newValue: number) => setAmount(newValue)) as any} />
    </Modal>;
}

function App() {
    const [records, setRecords] = useState<Record[]>([]);
    const [addModalVisible, setAddModalVisible] = useState(false);

    React.useEffect(() => {
        api.getRecords().then(setRecords);
    }, []);

    return <>
        {records.map(record => <RecordRow 
            key={record.id}
            record={record}
            handleEdit={() => {}}
            handleDeleteFinish={() => setRecords(records.filter(r => r.id != record.id))}/>)}
        <Button onClick={() => setAddModalVisible(true)}>添加</Button>
        {addModalVisible && <AddModal handleFinish={newRecord => { setRecords(records.concat([newRecord])); setAddModalVisible(false) }} />}
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));
