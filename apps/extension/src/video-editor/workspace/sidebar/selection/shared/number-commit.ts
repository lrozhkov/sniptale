import { useEffect, useRef } from 'react';

export function useDedupedNumberChange(onChange: (value: number) => void, appliedValue: number) {
  const lastValueRef = useRef<number | null>(null);

  useEffect(() => {
    // An external restore (such as Undo) makes the previous proposal editable again.
    if (lastValueRef.current !== appliedValue) lastValueRef.current = null;
  }, [appliedValue]);

  return (value: number) => {
    if (lastValueRef.current === value) {
      return;
    }
    lastValueRef.current = value;
    onChange(value);
  };
}
