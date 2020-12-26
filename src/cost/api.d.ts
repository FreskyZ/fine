
export interface Change {
    type: 'expend' | 'income',
    name: string,
    value: number,
    time: string,
    something?: string,
}