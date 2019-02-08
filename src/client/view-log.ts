
const logType = window.location.href.endsWith('log-ex') ? 'error' : 'info';
document.getElementById('root')!.innerText = `this is ${logType} log;`;
