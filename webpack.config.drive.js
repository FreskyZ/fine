const path = require('path');

module.exports = {
    entry: './src/client/drive/app.tsx',
    output: {
        filename: 'drive.js',
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
                loader: 'awesome-typescript-loader?configFileName=./tsconfig.client.drive.json' 
            },
        ],
    },
    
    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
    },
};
