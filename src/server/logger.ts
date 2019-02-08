import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import express from 'express';
import moment from 'moment';

const rootDirectory = process.cwd();
const logsDirectory = path.join(rootDirectory, 'logs');

export function setupLogger(app: express.Application): void {
    app.get('/logs/:filename', (request, response) => {
        const fileName = request.params.filename as string;
        const filePath = path.join(logsDirectory, fileName);

        if (fs.existsSync(filePath)) {
            response.sendFile(filePath);
        } else {
            response.status(404).end();
        }
    });
}

interface LogElement {
    time: string;
    cat: string;
    message: string;
}

const logNameFormat = 'Y-MM-DD';
const infoLogPostfix = '-info.log';
const errorLogPostfix = '-error.log';

class Logger {
    private cacheDate: string;
    private infos: LogElement[];
    private errors: LogElement[];

    constructor() {
        this.cacheDate = moment().utc().format(logNameFormat);

        this.infos = [];
        const infoLogFileName = path.join(logsDirectory, this.cacheDate + infoLogPostfix);
        if (fs.existsSync(infoLogFileName)) {
            try {
                this.infos = JSON.parse(fs.readFileSync(infoLogFileName).toString());
            } catch {
                // ignore json format error and discard file content
            }
        }

        this.errors = [];
        const errorLogFileName = path.join(logsDirectory, this.cacheDate + errorLogPostfix);
        if (fs.existsSync(errorLogFileName)) {
            try {
                this.errors = JSON.parse(fs.readFileSync(errorLogFileName).toString());
            } catch {
                // ignore json format error and discard file content
            }
        }
    }

    public info(cat: string, message: string): Logger {
        this.infos.push({ time: moment().toJSON(), cat, message });
        return this;
    }
    public error(cat: string, message: string): Logger {
        this.errors.push({ time: moment().toJSON(), cat, message });
        return this;
    }
}

const logger = new Logger();
export default logger;

