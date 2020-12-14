
async function buildOnce(_app: string) {
}

function buildWatch(_app: string) {
}

export async function build(app: string, watch: boolean): Promise<void> {
    if (watch) {
        buildWatch(app);
    } else {
        await buildOnce(app);
    }
}