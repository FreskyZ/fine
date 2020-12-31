import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, Tag, Modal, Radio, Input, InputNumber, message } from 'antd';
import { PlusOutlined }  from '@ant-design/icons';
import { DatePicker, TimePicker } from './dayjs-picker';
import dayjs from 'dayjs';
import type { Record } from '../api';
import * as api from './api';

type RecordRowProps = { record: Record, handleEdit: () => any };
const RecordRow: React.FC<RecordRowProps> = ({ record, handleEdit }) => {
    const displayType = record.type == 'cost' ? '支出' : record.type == 'income' ? '收入' : '转移';

    return <div className='record-display' onClick={handleEdit}>
        <span className='record-title'>{record.title}</span>
        <span className='record-tags'>{[displayType].concat(record.tags).map(tag => <Tag className='record-tag'><span>{tag}</span></Tag>)}</span>
        <span className='record-time'>{record.time}</span>
        <span className='record-amount'>&#x00A5;{record.amount}</span>
    </div>;
}

// TODO: try antd 4 form later
type AddModalProps = {
    originalData?: Record, 
    handleCancel: () => void, 
    handleCreateUpdateFinish: (newRecord: Record) => any, 
    handleDeleteFinish: () => any,
};
const AddModal: React.FC<AddModalProps> = ({ originalData, handleCancel, handleCreateUpdateFinish, handleDeleteFinish }) => {
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState(originalData?.title ?? '');
    const [tags, setTags] = useState(originalData?.tags?.join(',') ?? '');
    const [type, setType] = useState<Record['type']>(originalData?.type ?? 'cost');
    const [time, setTime] = useState(dayjs(originalData?.time) ?? dayjs());
    const [amount, setAmount] = useState<number>(originalData?.amount);

    const handleSave = () => {
        setLoading(true);

        if (originalData) {
            api.updateRecord(originalData.id, { id: originalData.id, title, type, tags: tags ? tags.split(',') : [], amount: amount || 0, time: time.format('YYYYMMDD-HHmmss') }).then(result => {
                message.info('保存成功');
                result.time = time.format('YYYY-MM-DD HH:mm:ss');
                handleCreateUpdateFinish(result);
            }, ex => {
                setLoading(false);
                message.error('保存没成功：' + ex.message);
            });
        } else {
            api.addRecord({ id: 0, title, type, tags: tags ? tags.split(',') : [], amount: amount || 0, time: time.format('YYYYMMDD-HHmmss') }).then(result => {
                message.info('保存成功');
                result.time = time.format('YYYY-MM-DD HH:mm:ss');
                handleCreateUpdateFinish(result);
            }, ex => {
                setLoading(false);
                message.error('保存没成功：' + ex.message);
            });
        }
    }

    const handleDelete = () => {
        Modal.confirm({
            centered: true,
            content: '确定要删除吗？',
            okText: '确定',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: () => {
                setLoading(true);
                api.deleteRecord(originalData.id).then(() => {
                    message.info('删除成功');
                    handleDeleteFinish();
                }, ex => {
                    message.error('删除失败：' + ex.message);
                    setLoading(false);
                });
            },
        });
    }

    return <Modal 
        title='添加'
        visible={true}
        className='record-edit'
        maskClosable={false}
        centered={true}
        onCancel={handleCancel}
        footer={<>
            {originalData && <Button loading={loading} danger={true} size='small' onClick={handleDelete}>删除</Button>}
            <Button loading={loading} disabled={!title || !amount} size='small' onClick={handleSave}>保存</Button>
        </>}>
        <Radio.Group className='record-type' value={type} disabled={loading} onChange={e => setType(e.target.value)}>
            <Radio value='cost'>支出</Radio>
            <Radio value='income'>收入</Radio>
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
    const [addModalOriginalData, setAddModalOriginalData] = useState<Record>(null);

    React.useEffect(() => {
        api.getRecords().then(setRecords);
    }, []);

    return <>
        <header>WIMM?</header>
        {records.sort((r1, r2) => dayjs(r1.time).isBefore(dayjs(r2.time)) ? 1 : dayjs(r1.time).isAfter(dayjs(r2.time)) ? -1 : 0).map(record => <RecordRow 
            key={record.id}
            record={record}
            handleEdit={() => { setAddModalOriginalData(record); setAddModalVisible(true) }}/>)}
        <div className='add-container'><Button icon={<PlusOutlined />} shape='circle' onClick={() => { setAddModalOriginalData(null); setAddModalVisible(true); }} /></div>
        {addModalVisible && <AddModal 
            originalData={addModalOriginalData}
            handleCancel={() => { setAddModalOriginalData(null); setAddModalVisible(false); }}
            handleDeleteFinish={() => { setRecords(records.filter(r => r.id != addModalOriginalData.id)); setAddModalOriginalData(null); setAddModalVisible(false); }}
            handleCreateUpdateFinish={newRecord => { setRecords(records.filter(r => r.id != newRecord.id).concat([newRecord])); setAddModalOriginalData(null); setAddModalVisible(false); }} />}
    </>;
}

ReactDOM.render(<App/>, document.querySelector('div#root'));
