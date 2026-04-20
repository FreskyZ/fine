import dayjs from 'dayjs';

export interface ApplicationServerRequest {
    // iso8601 request time
    time: string,
    userId: number,
    method: string,
    // GET api.example.com/appname/v1/something?param1=value1&param2=value2
    //                 this part: ^^^^^^^^^^^^^
    // GET api.example.com/appname/public/v1/something?param1=value1
    //                 this part: ^^^^^^^^^^^^^^^^^^^^
    path: string,
    query: string,
    body: any,
}
export interface ApplicationServerResponse {
    body?: any,
    error?: Error,
}
