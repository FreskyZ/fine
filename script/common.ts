import { readFileSync } from 'fs';

export const projectDirectory = '<PROJECTDIR>';
export const nodePackage = JSON.parse(readFileSync('package.json', 'utf-8'));
