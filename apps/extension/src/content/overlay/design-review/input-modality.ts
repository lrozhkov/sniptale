import { useEffect, useState } from 'react';

/** Tracks input intent across the inspector and its owned portaled controls. */
export function useDesignReviewInputModality(): 'keyboard' | 'pointer' {
  const [modality, setModality] = useState<'keyboard' | 'pointer'>('pointer');
  useEffect(() => {
    const useKeyboard = () => setModality('keyboard');
    const usePointer = () => setModality('pointer');
    document.addEventListener('keydown', useKeyboard, true);
    document.addEventListener('pointerdown', usePointer, true);
    document.addEventListener('mousedown', usePointer, true);
    return () => {
      document.removeEventListener('keydown', useKeyboard, true);
      document.removeEventListener('pointerdown', usePointer, true);
      document.removeEventListener('mousedown', usePointer, true);
    };
  }, []);
  return modality;
}
