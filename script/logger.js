"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chalk_1 = require("chalk");
const moment = require("moment");
// include some type declare fixes in this small file
class Logger {
    constructor(cat) {
        this.cat = cat;
    }
    header() {
        process.stdout.write(chalk_1.default `{magenta [}{gray ${this.cat}@${moment().format('HH:MM:SS')}]} `);
        return this;
    }
    write(message) {
        process.stdout.write(message + '\n');
        return this;
    }
}
exports.default = Logger;
;
