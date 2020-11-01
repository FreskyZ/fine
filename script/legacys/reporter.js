const chalk = require('chalk');
const moment = require('moment');

module.exports = class Reporter {
    constructor(cat) {
        this.cat = cat;
    }

    write(message) {
        console.log(message);
    }
    writeWithHeader(message) {
        console.log(chalk`[{gray ${this.cat}@${moment().format('HH:mm:ss')}]} ${message}`);
    }
};

