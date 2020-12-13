// front end call api common infrastructure, include authentication

async function impl(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<any> {
    return fetch(`https://api.{__DOMAIN_NAME__}/${path}`, { method, body, headers: { 'X-Access-Token': 'token' } }).then(response => response.json());
}
export async function get<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('GET',  path, body); }
export async function post<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('POST',  path, body); }
export async function put<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PUT',  path, body); }
export async function patch<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PATCH',  path, body); }
export async function del<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('DELETE',  path, body); }
