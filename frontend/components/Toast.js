'use client';
import { useEffect, useState } from 'react';

export default function Toast({ message, duration = 2500 }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), duration);
    return () => clearTimeout(t);
  }, [duration]);

  if (!visible) return null;
  return <div className="toast">{message}</div>;
}
