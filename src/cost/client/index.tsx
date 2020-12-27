import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, Tag, Modal, Radio, Input, InputNumber, Spin, Popconfirm, message } from 'antd';
import { CloseOutlined, PlusOutlined }  from '@ant-design/icons';
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

    const displayType = record.type == 'cost' ? '支出' : record.type == 'income' ? '收入' : '转移';

    return <div className='record-display' onClick={handleEdit}><Spin spinning={loading}>
        <span className='record-title'>{record.title}</span>
        <span className='record-tags'>{[displayType].concat(record.tags).map(tag => <Tag className='record-tag'><span>{tag}</span></Tag>)}</span>
        <span className='record-time'>{record.time}</span>
        <span className='record-amount'>&#x00A5;{record.amount}</span>
        <Popconfirm title='确定要删除这条记录吗？' cancelText='取消' okText='确认' onConfirm={handleDelete}>
            <CloseOutlined />
        </Popconfirm>
    </Spin></div>;
}

// TODO: try antd 4 form later
type AddModalProps = { handleCancel: () => void, handleFinish: (newRecord: Record) => any };
const AddModal: React.FC<AddModalProps> = ({ handleCancel, handleFinish }) => {
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState('');
    const [tags, setTags] = useState('');
    const [type, setType] = useState<Record['type']>('cost');
    const [time, setTime] = useState(dayjs());
    const [amount, setAmount] = useState<number>(undefined);

    const handleSave = () => {
        setLoading(true);
        api.addRecord({ id: 0, title, type, tags: tags ? tags.split(',') : [], amount: amount || 0, time: time.format('YYYYMMDD-HHmmss') }).then(result => {
            message.info('保存成功');
            result.time = time.format('YYYY-MM-DD HH:mm:ss');
            handleFinish(result);
        }, ex => {
            setLoading(false);
            message.error('保存没成功：' + ex.message);
        });
    }

    return <Modal 
        title='添加'
        visible={true}
        className='record-edit'
        maskClosable={false}
        centered={true}
        onCancel={handleCancel}
        footer={<Button loading={loading} disabled={!title || !amount} size='small' onClick={handleSave}>保存</Button>}>
        <Radio.Group className='record-type' value={type} disabled={loading} onChange={e => setType(e.target.value)}>
            <Radio value='cost'>支出</Radio>
            <Radio disabled={true} value='income'>收入</Radio>
            <Radio disabled={true} value='transfer'>转移</Radio>
        </Radio.Group>
        <Input className='record-title' value={title} disabled={loading} onChange={e => setTitle(e.target.value)} />
        <Input className='record-tags' value={tags} placeholder='标签，逗号分隔' disabled={loading} onChange={e => setTags(e.target.value)} />
        <InputNumber className='record-amount' value={amount} disabled={loading} onChange={((newValue: number) => setAmount(newValue)) as any} />
        <DatePicker className='record-date' value={time} disabled={loading} onChange={newValue => setTime(time.year(newValue.year()).month(newValue.month()).date(newValue.date()))} />
        <TimePicker className='record-time' value={time} disabled={loading} onChange={newValue => setTime(time.hour(newValue.hour()).minute(newValue.minute()).second(newValue.second()))} />
    </Modal>;
}

function App() {
    const [records, setRecords] = useState<Record[]>([]);
    const [addModalVisible, setAddModalVisible] = useState(false);

    React.useEffect(() => {
        api.getRecords().then(setRecords);
    }, []);

    return <>
        <header>WIMM?</header>
        {records.sort((r1, r2) => dayjs(r1.time).isBefore(dayjs(r2.time)) ? 1 : dayjs(r1.time).isAfter(dayjs(r2.time)) ? -1 : 0).map(record => <RecordRow 
            key={record.id}
            record={record}
            handleEdit={() => message.info('TODO')}
            handleDeleteFinish={() => setRecords(records.filter(r => r.id != record.id))}/>)}
        <div className='add-container'><Button icon={<PlusOutlined />} shape='circle' onClick={() => setAddModalVisible(true)} /></div>
        {addModalVisible && <AddModal 
            handleCancel={() => setAddModalVisible(false)}
            handleFinish={newRecord => { setRecords(records.concat([newRecord])); setAddModalVisible(false) }} />}
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));
