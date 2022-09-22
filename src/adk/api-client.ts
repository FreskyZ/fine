// front end call api common infrastructure, include authentication

async function impl(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: any): Promise<any> {
    const response = await fetch(`https://api.domain.com${path}`, {
        method,
        body: body ? JSON.stringify(body) : undefined,
        headers: {
            'X-Token': localStorage['access-token'],
            'Content-Type': body ? 'application/json' : 'application/octec-stream',
        },
    });

    // normal/error both return json body, but void do not
    const isjson = response.headers.has('Content-Type') && response.headers.get('Content-Type').includes('application/json');
    const data = isjson ? await response.json() : {};
    return response.ok ? Promise.resolve(data)
        : Math.floor(response.status / 100) == 4 ? Promise.reject(data)
        : Math.floor(response.status / 100) == 5 ? Promise.reject({ message: 'internal error' })
        : Promise.reject({ message: 'unknown error' });
}
export async function get<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('GET',  path, body); }
export async function post<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('POST',  path, body); }
export async function put<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PUT',  path, body); }
export async function patch<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('PATCH',  path, body); }
export async function del<Result, Body = void>(path: string, body?: Body): Promise<Result> { return await impl('DELETE',  path, body); }
