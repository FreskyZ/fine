import * as React from 'react';

interface CountComponentProps {
    count: number,
}

function CountComponent({ count }: CountComponentProps): JSX.Element {
    return <p>current count: {count}</p>;
}

export default CountComponent;

