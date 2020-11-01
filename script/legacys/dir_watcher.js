const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const projectDirectory = process.cwd();

function getAllDirectories(rootDirectory) {
    const results = [rootDirectory];

    function recurseImpl(directory) {
        const subDirectories = fs.readdirSync(directory, { withFileTypes: true })
            .filter(e => e.isDirectory()).map(e => path.join(directory, e.name));
        
        results.push(...subDirectories);
        for (const entry of subDirectories) {
            recurseImpl(entry);
        }
    }

    recurseImpl(rootDirectory);
    return results;
}

class DirectoryWatcher {
    
    constructor(relativeDirectory, buildCallback) {
        
        this.relativeDirectory = relativeDirectory;
        this.rootDirectory = path.join(projectDirectory, relativeDirectory);
        console.log('> ' + chalk.bgBlackBright('start watching ' + this.relativeDirectory));
        
        const allDirectories = getAllDirectories(this.rootDirectory);
        this.watchers = [];
        for (const directory of allDirectories) {
            this.watchers.push(fs.watch(directory, this.getWatchCallback(directory)));
            console.log(' - ' + path.relative(projectDirectory, directory));
        }

        this.watchers = [];
        this.idleTimer = null;
        
        this.building = false;
        this.buildAgainRequested = false;
        this.buildCallback = buildCallback;
    }

    getWatchCallback(directory) { // directory is absolute
        return (eventType, fileName) => {
            if (fileName[0] == '.') return; // ignore hidden
            if (fileName.endsWith('~')) return; // ignore temp
            
            fs.stat(path.join(directory, fileName), (err, stat) => {
                if (err) return; // ignore any error
                
                if (!stat.isFile()) return; // ignore is not file
                
                // const changeReport = 
                //    `directory '${directory}' event type '${eventType}' file name '${fileName}'`;
                // console.log(' - ' + chalk.gray(changeReport));
                this.handleFileChange();
            });
        }
    } 

    // schedule build after 3 seconds idle if any change happens
    // this function does not care what event type and file name happens
    handleFileChange() {
        if (this.idleTimer != null) {
            clearTimeout(this.idleTimer);
        }

        this.idleTimer = setTimeout(() => this.handleBuild(), 3000);
    }

    // prevent reentry of build handler, and build again after this build finished
    handleBuild() {
        if (this.building) this.buildAgainRequested = true;
        
        this.building = true;

        console.log('> ' + chalk.gray('building'));
        this.buildCallback().then(() => {
            // NOTE: if the timer fires between end of the build operation and next calling of build
            // e.g. this line, this calling of build will mark a build again, which is incorrect
            // but lazy to deal with the issue, 

            this.building = false;
            if (this.buildAgainRequested) {
                this.buildAgainRequested = false;
                handleRebuild();
            }
        });
    }

    stop(reason) {
        console.log('\n> ' + chalk.bgBlackBright(reason + ', stop watching ' + this.relativeDirectory));
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }

        for (const watcher of this.watchers) {
            watcher.close();
        }
    }
}

module.exports = DirectoryWatcher;

