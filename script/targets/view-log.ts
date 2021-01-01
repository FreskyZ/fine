
import * as fs from 'fs';
import { getCompileTimeConfig } from '../common';
import { download } from '../tools/ssh';

const config = getCompileTimeConfig();
const webroot = config['WEB' + 'ROOT'];

export function viewlog(a2: string) {
    
    // temp solution before actual view-log
    download([`${webroot}/logs/${a2}-info.log`, `${webroot}/logs/${a2}-error.log`]).then(assets => {
        fs.writeFileSync('infolog.json', assets[0].data);
        fs.writeFileSync('errorlog.json', assets[1].data);
    });
}
