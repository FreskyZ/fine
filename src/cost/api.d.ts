
export interface Record {
    id: number,
    title: string,
    type: 'cost' | 'income' | 'transfer',
    amount: number,
    tags: string[], // front end and back end both expect this to be empty not undefined/null when received
    time: string,
    transferFrom?: string,
    transferInto?: string,
}

export interface Account {
    id: number,
    name: string,
    balance: number,
}
