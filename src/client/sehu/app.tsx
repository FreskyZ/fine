import * as React from 'react';
// import { useState } from 'react';
import * as ReactDOM from 'react-dom';
import CountComponent from './count-component';

/*
function App() {
    const [count, setCount] = useState(0);

    return <div>
        <CountComponent count={count}/>
        <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>;
}
*/

class App extends React.Component {
    state = {
        count: 0,
    }

    render() {
        const { count } = this.state;

        return <div>
            <CountComponent count={count}/>
            <button onClick={() => this.setState({ count: this.state.count + 1 })}>Click me</button>
        </div>;
    }
}

ReactDOM.render(<App/>, document.getElementById('root'));

