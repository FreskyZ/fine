import chalk from 'chalk';
import * as moment from 'moment';

// include some type declare fixes in this small file

export default class Logger {
    constructor(public cat: string) {
    }

    header(): Logger {
        process.stdout.write(chalk`{magenta [}{gray ${this.cat}@${moment().format('HH:MM:SS')}]} `);
        return this;
    }
    write(message: string): Logger {
        process.stdout.write(message + '\n');
        return this;
    }
};
