
export function templ() {
    throw { message: 'some message', stack: new Error().stack };
}