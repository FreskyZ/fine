const fs = require('fs');
const path = require('path');
const process = require('process');

module.exports = env => {
    
    const tsConfigName = './tsconfig/client.' + env.project_name + '.json';
    if (!fs.existsSync(tsConfigName)) {
        console.log('webpack.config: invalid tsconfig file name: ' + tsConfigName);
        process.exit(1);
    }

    return {
        entry: './src/client/' + env.project_name + '/app.tsx',
        output: {
            filename: env.project_name + '.js',
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
};
