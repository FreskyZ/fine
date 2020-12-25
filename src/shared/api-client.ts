// front end call api common infrastructure, include authentication

async function impl(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<any> {
    const response = await fetch(`https://api.DOMAIN_NAME${path}`, { method, body, headers: { 'X-Access-Token': localStorage['access-token'] } });
    const data = await response.json(); // normal/error both return json body
    return response.ok ? Promise.resolve(data) : Promise.reject(data);
}
export async function get<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('GET',  path, body); }
export async function post<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('POST',  path, body); }
export async function put<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PUT',  path, body); }
export async function patch<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PATCH',  path, body); }
export async function del<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('DELETE',  path, body); }
