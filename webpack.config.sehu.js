const path = require('path');

module.exports = {
    entry: './src/client/sehu/app.tsx',
    output: {
        filename: 'sehu.js',
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
                loader: 'awesome-typescript-loader?configFileName=./tsconfig.client.sehu.json'
            },
        ],
    },

    externals: {
        'react': 'React',
        'react-dom': 'ReactDOM',
    },
};
