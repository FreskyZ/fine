// front end call api common infrastructure, include authentication

export class MyFetch {
    constructor(private appname: string) {}

    private async impl(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<any> {
        return fetch(`/${this.appname}${path}`, { method, body, headers: { 'X-Access-Token': 'token' } }).then(response => response.json());
    }
    public async get<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await this.impl('GET',  path, body); }
    public async post<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await this.impl('POST',  path, body); }
    public async put<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await this.impl('PUT',  path, body); }
    public async patch<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await this.impl('PATCH',  path, body); }
    public async del<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await this.impl('DELETE',  path, body); }
}
