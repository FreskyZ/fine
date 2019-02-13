
interface Moment {
    format(f: string): string;
}
interface MomentModule {
    (): Moment;
}
declare var moment: MomentModule;

document.getElementById('date')!.innerText = moment().format('Y-M-D');

