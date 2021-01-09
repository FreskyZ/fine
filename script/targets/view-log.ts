
import * as fs from 'fs';
import { config } from '../config';
import { download } from '../tools/ssh';

export function viewlog(a2: string) {
    
    // temp solution before actual view-log
    download([`${config.webroot}/logs/${a2}-info.log`, `${config.webroot}/logs/${a2}-error.log`]).then(assets => {
        fs.writeFileSync('infolog.json', assets[0].data);
        fs.writeFileSync('errorlog.json', assets[1].data);
    });
}
