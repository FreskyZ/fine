
interface Moment {
    isValid(): boolean;
    format(f: string): string;
    toJSON(): string;
    utc(): Moment;
    startOf(type: string): Moment;
    add(count: number, type: string): Moment;
    subtract(count: number, type: string): Moment;
    isAfter(another: Moment): boolean;
}
interface MomentModule {
    (): Moment;
    (date: Date): Moment;
    (value: string): Moment;
    (another: Moment): Moment;
    utc(value: string): Moment;
}
declare var moment: MomentModule;

type Level = 'info' | 'error';
function getLevel(): Level {
    return window.location.pathname.endsWith('log-info') ? 'info' : 'error';
}

interface Filter { since: Moment, until: Moment, cat: string | null, messageContains: string | null }
function getFilter(): Filter {
    const params = new URLSearchParams(window.location.search);

    let since = moment().utc().startOf('day').subtract(7, 'days');
    const sinceString = params.get('since');
    if (sinceString != null) {
        const sinceValue = moment.utc(sinceString);
        if (sinceValue.isValid()) {
            since = sinceValue;
        }
    }
    params.set('since', since.toJSON());

    let until = moment().utc();
    const untilString = params.get('until');
    if (untilString != null) {
        const untilValue = moment.utc(untilString);
        if (untilValue.isValid()) {
            until = untilValue;
        }
    }
    params.set('until', until.toJSON());

    if (history.pushState) {
        const loc = window.location;
        const newURL = `${loc.protocol}//${loc.host}${loc.pathname}?${params.toString()}`;
        window.history.pushState({ path: newURL }, '', newURL);
    }
    return { since, until, cat: params.get('cat'), messageContains: params.get('messageContains') };
}
function displayFilter(filter: Filter): string {

    let result = `since ${filter.since.toJSON()}, until ${filter.until.toJSON()}`;
    if (filter.cat) result += ', category ' + filter.cat;
    if (filter.messageContains) result += '. message contains \'' + filter.messageContains + "'";
    return result;
}

const level = getLevel();
const filter = getFilter();
document.getElementById('filter')!.innerText = displayFilter(filter);

let fileNames: string[] = [];
for (let n = 0; n < 100; n += 1) {
    const date = moment(filter.since).add(n, 'days');
    if (date.isAfter(filter.until)) { // start from 0 also filters out since > until
        break;
    }
    fileNames.push(`/logs/${date.format('Y-MM-DD')}-${level}.log`);
}

interface LogElement { time: string, cat: string, message: string }
if (fileNames.length == 0) {
    document.getElementById('root')!.innerText = 'no logs available';
} else {
    Promise.all(fileNames.map(n => fetch(n))).then(responses => {
        Promise.all(responses.filter(r => r.status == 200).map(r => r.json())).then(jsons => {
            const datas = jsons as LogElement[][];
            const elements = datas.flatMap(x => x);

            const filterElements = elements.filter(e =>
                (filter.cat == null || e.cat == filter.cat)
                && (filter.messageContains == null || e.message.includes(filter.messageContains)));

            document.getElementById('root')!.innerText =
                filterElements.map(e => `[${e.time}][${e.cat}] ${e.message}`).join('\r\n');
        }, ex => {
            console.log(ex);
        });
    }, ex => {
        console.log(ex);
    });
}

