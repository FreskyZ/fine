import { Context } from '../../shared/api-server';
import type { Change } from '../api';

export async function getChanges(_: Context): Promise<Change[]> {
    return [
        { type: 'expend', name: 'fan', value: 20, time: '!+10' },
        { type: 'expend', name: 'fan2', value: 25, time: '!*100' },
        { type: 'expend', name: 'fan3', value: 38, time: '123' },
    ];
}

export async function getChange(_: Context, _changeId: number): Promise<Change> {
    return { type: 'expend', name: 'fan', value: 20, time: '!+10' };
}

export async function createChange(_: Context, _changeId: number, _change: Change): Promise<Change> {
    return { type: 'expend', name: 'fan2', value: 25, time: '!*100' };
}

export async function updateChange(_: Context, _changeId: number, _change: Change): Promise<Change> {
    return { type: 'expend', name: 'fan3', value: 30, time: '123' };
}

export async function deleteChange(_: Context, _changeId: number): Promise<void> {

}
