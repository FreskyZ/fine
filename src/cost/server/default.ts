import * as dayjs from 'dayjs';
import { Context } from '../../shared/api-server';
import { query, QueryResult, QueryDateTimeFormat } from '../../shared/database';
import { MyError } from '../../shared/error';
import type { Record, Account } from '../api';

export async function getRecords(ctx: Context): Promise<Record[]> {
    
    const { value } = await query('SELECT `Id`, `Title`, `Type`, `Tags`, `Amount`, `Tags`, `Time` FROM `WIMMRecord` WHERE `UserId` = ?', ctx.user.id);
    if (!Array.isArray(value)) {
        throw new Error('unexpected query result');
    }

    return value.map(v => ({
        id: v.Id,
        title: v.Title,
        type: v.Type,
        tags: v.Tags ? v.Tags.split(',') : [],
        amount: v.Amount,
        time: v.Time,
    }));
}

export async function getRecord(_: Context, _recordId: number): Promise<Record> {
    return null;
}

export async function addRecord(ctx: Context, record: Record): Promise<Record> {
    if (!record.title) {
        throw new MyError('common', 'title cannot be empty');
    }
    if (!['cost', 'income', 'transfer'].includes(record.type)) {
        throw new MyError('common', 'invalid type');
    }
    if (record.amount <= 0) {
        throw new MyError('common', 'amount should be larger than 0');
    }

    const time = dayjs(record.time, 'YYYYMMDD-HHmmss');
    if (!time.isValid()) {
        throw new MyError('common', 'invalid time');
    }

    const { value: { insertId: recordId } } = await query<QueryResult>(
        'INSERT INTO `WIMMRecord` (`Title`, `Type`, `Tags`, `Amount`, `Time`, `UserId`) VALUES (?, ?, ?, ?, ?, ?)',
        record.title, record.type, record.tags ? record.tags.join(',') : null, record.amount, time.format(QueryDateTimeFormat.datetime), ctx.user.id);

    return { ...record, id: recordId };
}

export async function updateRecord(_: Context, _recordId: number, _change: Record): Promise<Record> {
    return null;
}

export async function deleteRecord(ctx: Context, recordId: number): Promise<void> {

    const { value } = await query('SELECT `Id` FROM `WIMMRecord` WHERE `Id` = ? AND `UserId` = ?', recordId, ctx.user.id);
    if (!Array.isArray(value) || value.length != 1) {
        throw new MyError('common', 'invalid record id');
    }

    await query('DELETE FROM `WIMMRecord` WHERE `Id` = ?', recordId);
}

export async function getAccounts(_: Context): Promise<Account[]> {
    return [];
}
