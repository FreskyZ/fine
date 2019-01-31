
interface StaticFile {
    route: string,
    filename: string,
}

const STATIC_FILES: StaticFile[] = [
    { route: '', filename: 'index.html' },
    { route: 'blog', filename: 'blog.html' },
    { route: 'sh-bus', filename: 'sh-bus.html' },
];

export { STATIC_FILES };
