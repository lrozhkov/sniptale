import { useRef } from 'react';

export function useDedupedNumberChange(onChange: (value: number) => void) {
  const lastValueRef = useRef<number | null>(null);

  return (value: number) => {
    if (lastValueRef.current === value) {
      return;
    }
    lastValueRef.current = value;
    onChange(value);
  };
}
