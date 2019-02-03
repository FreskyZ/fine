import * as React from 'react';
import { useState } from 'react';
import * as ReactDOM from 'react-dom';
import CountComponent from './count-component';

function App() {
    const [count, setCount] = useState(0);

    return <div>
        <h4>SHANGHAI BUS QUERY</h4>
        <CountComponent count={count}/>
        <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>;
}

ReactDOM.render(<App/>, document.getElementById('root'));

