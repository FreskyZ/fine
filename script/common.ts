import { readFileSync } from 'fs';

export const projectDirectory = '<PROJECTDIR>';
export const nodePackage = JSON.parse(readFileSync('package.json', 'utf-8'));

process.on('unhandledRejection', error => { 
    console.log('unhandled reject: ', error);
    process.exit(0);
});
