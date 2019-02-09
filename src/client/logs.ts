
interface Moment {
    isValid(): boolean;
    format(f: string): string;
    toDate(): Date;
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

const uiElements = {
    'level': document.querySelector('select#level')! as HTMLSelectElement,
    'since': document.querySelector('input#since')! as HTMLInputElement,
    'until': document.querySelector('input#until')! as HTMLInputElement,
    'cat': document.querySelector('input#cat')! as HTMLInputElement,
    'contains': document.querySelector('input#contains')! as HTMLInputElement,
    'reverse': document.querySelector('input#reverse')! as HTMLInputElement,
    'auto-refresh-cbx': document.querySelector('div#auto-refresh>input[type="checkbox"]')! as HTMLInputElement,
    'auto-refresh-label': document.querySelector('div#auto-refresh>label')! as HTMLLabelElement,
    'auto-refresh-sec': document.querySelector('div#auto-refresh>input[type="text"]')! as HTMLInputElement,
    'reset-btn': document.querySelector('button#reset')! as HTMLButtonElement,
    'apply-btn': document.querySelector('button#apply')! as HTMLButtonElement,
    'result-count': document.querySelector('label#result-count')! as HTMLLabelElement,
    'table': document.querySelector('table')! as HTMLTableElement,
};

type Level = 'info' | 'error';
class Filter {
    public constructor(
        public level: Level,
        public since: Moment,
        public until: Moment,
        public cat: string | null,
        public contains: string[],
        public reverse: boolean) {}

    public static createDefault(): Filter {
        return new Filter('info', moment().utc().startOf('day'), moment().utc(), null, [], true);
    }
    public resetDefault(): void {
        this.level = 'info';
        this.since = moment().utc().startOf('day');
        this.until = moment().utc();
        this.cat = null;
        this.contains = [];
        this.reverse = true;
    }

    public applyToForm(): void {
        uiElements['level'].value = this.level;
        uiElements['since'].value = this.since.format('Y-MM-DDTHH:mm');
        uiElements['until'].value = this.until.format('Y-MM-DDTHH:mm');
        uiElements['cat'].value = this.cat || '';
        uiElements['contains'].value = this.contains.join(', ');
        uiElements['reverse'].checked = this.reverse;
    }
    public readFromForm(): void {
        this.level = uiElements['level'].value as Level;
        this.since = moment(uiElements['since'].value);
        this.until = moment(uiElements['until'].value);
        this.cat = uiElements['cat'].value.length == 0 ? null : uiElements['cat'].value;
        this.contains = uiElements['contains'].value.length == 0 ? []
            : uiElements['contains'].value.split(',').map(x => x.trim());
        this.reverse = uiElements['reverse'].checked;
    }
}

interface LogEntry { time: string, cat: string, message: string }

const rowElements: HTMLTableRowElement[] = [];
function getData(filter: Filter): void {

    let fileNames: string[] = [];
    for (let n = 0; n < 100; n += 1) {
        const date = moment(filter.since).add(n, 'days');
        if (date.isAfter(filter.until)) { // start from 0 also filters out since > until
            break;
        }
        fileNames.push(`/logs/${date.format('Y-MM-DD')}-${filter.level}.log`);
    }

    if (fileNames.length == 0) {
        uiElements['result-count'].innerText = 'no logs available';
        return;
    }

    Promise.all(fileNames.map(n => fetch(n))).then(responses => {
        Promise.all(responses.map(r => r.json())).then(jsons => {
            const datas = jsons as LogEntry[][];
            const originalEntries = datas.flatMap(x => x);

            const filterEntries = originalEntries.filter(e =>
                (filter.cat == null || e.cat == filter.cat)
                && (filter.contains.length == 0 || filter.contains.some(c => e.message.includes(c))));
            const entries = filter.reverse ? filterEntries.reverse() : filterEntries;

            uiElements['result-count'].innerText = `${entries.length} results`;

            const originalRowElementLength = rowElements.length;
            for (let index = 0; index < entries.length || index < originalRowElementLength; ++index) {

                if (index < entries.length) {
                    const entry = entries[index];
                    const tr = index < originalRowElementLength
                        ? rowElements[index] : document.createElement('tr') as HTMLTableRowElement;
                    if (index < originalRowElementLength) {
                        const td1 = tr.children[0] as HTMLTableDataCellElement;
                        td1.innerText = moment(entry.time).format('MM-DD HH:mm');
                        td1.setAttribute('title', entry.time);
                        (tr.children[1] as HTMLTableDataCellElement).innerText = entry.cat;
                        (tr.children[2] as HTMLTableDataCellElement).innerText = entry.message;
                    } else {
                        const td1 = document.createElement('td');
                        td1.innerText = moment(entry.time).format('MM-DD HH:mm');
                        td1.setAttribute('title', entry.time);
                        td1.className = 'time';
                        const td2 = document.createElement('td');
                        td2.className = 'cat';
                        td2.innerText = entry.cat;
                        const td3 = document.createElement('td');
                        td3.className = 'message';
                        td3.innerText = entry.message;

                        tr.appendChild(td1);
                        tr.appendChild(td2);
                        tr.appendChild(td3);
                        rowElements.push(tr);
                    }
                    if (tr.parentElement == null) {
                        uiElements['table'].appendChild(tr);
                    }
                } else {
                    rowElements[index].remove();
                }
            }
        }, ex => {
            console.log(ex);
        });
    }, ex => {
        console.log(ex);
    });
}

const filter = Filter.createDefault();
filter.applyToForm();
getData(filter);

uiElements['reset-btn'].onclick = _e => {
    filter.resetDefault();
    filter.applyToForm();
    getData(filter);
};
uiElements['apply-btn'].onclick = _e => {
    filter.readFromForm();
    getData(filter);
};

