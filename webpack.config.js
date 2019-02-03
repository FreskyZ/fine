const fs = require('fs');
const path = require('path');
const process = require('process');

const projectName = process.env['HOME_FRESKY_PROJECT_NAME'];
if (!projectName) {
    console.log('abort: empty project name');
    process.exit(1);
}

const tsConfigName = './tsconfig.client.' + projectName + '.json';
if (!fs.existsSync(tsConfigName)) {
    console.log('abort: tsconfig file ' + tsConfigName + ' not exist');
    process.exit(1);
}

module.exports = {
    entry: './src/client/' + projectName + '/app.tsx',
    output: {
        filename: projectName + '.js',
        path: path.join(__dirname, 'static'),
    },

    devtool: 'source-map',
    resolve: {
        extensions: ['.ts', '.tsx'],
    },

    module: {
        rules: [
            { 
                test: /\.tsx?$/, 
                loader: 'awesome-typescript-loader?configFileName=' + tsConfigName, 
            },
        ],
    },
    
    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
    },
};
