'use client';

import { useState } from 'react';

export function TestJsx(): JSX.Element {
  const [count, setCount] = useState(0);

  return (
    <div className="test">
      <p>Count: {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
    </div>
  );
}