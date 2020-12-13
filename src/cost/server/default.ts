import { Context } from '../../shared/api-server';
import type { Change } from '../api';

export async function getChanges(_: Context): Promise<Change[]> {
    return [];
}

export async function getChange(_: Context, _changeId: number): Promise<Change> {
    return { type: 'expend', time: '123' };
}

export async function createChange(_: Context, _changeId: number, _change: Change): Promise<Change> {
    return { type: 'expend', time: '123' };
}

export async function updateChange(_: Context, _changeId: number, _change: Change): Promise<Change> {
    return { type: 'expend', time: '123' };
}

export async function deleteChange(_: Context, _changeId: number): Promise<void> {

}
