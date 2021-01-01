// ATTENTION:
// This code was generated by a tool.
// Changes to this file may cause incorrect behavior and will be lost if the code is regenerated.

import { get, post, put, del } from '../../shared/api-client';
import type { Record, Account } from '../api';

export const getRecords = (): Promise<Record[]> => get(`/wimm/v1/records`);
export const addRecord = (record: Record): Promise<Record> => post(`/wimm/v1/records`, record);
export const getRecord = (recordId: number): Promise<Record> => get(`/wimm/v1/records/${recordId}`);
export const updateRecord = (recordId: number, record: Record): Promise<Record> => put(`/wimm/v1/records/${recordId}`, record);
export const deleteRecord = (recordId: number): Promise<void> => del(`/wimm/v1/records/${recordId}`);
export const getAccounts = (): Promise<Account[]> => get(`/wimm/v1/accounts`);