const chalk = require('chalk');
const minimist = require('minimist');

module.exports = function getBuildTarget() {
    if (process.argv.length < 3) {
        console.log(chalk`{red error}: not enough arguments`);
        process.exit(1);
    }

    const target = process.argv[2];
    const [name, type] = target == 'server' ? ['server', 'server']
        : target.endsWith('-page') ? [target.slice(0, -5), 'page']
        : target.endsWith('-app') ? [target.slice(0, -4), 'app']
        : (() => { 
            console.log(chalk`{red error}: invalid target`); 
            process.exit(1);
        })();

    const options = minimist(process.argv.slice(3));
    return { name, type, options };
}
 
