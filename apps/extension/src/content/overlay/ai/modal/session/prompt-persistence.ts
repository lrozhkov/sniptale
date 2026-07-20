import { useEffect } from 'react';

export function useAIModalPromptPersistenceEffect(args: {
  bootedWhileOpenRef: React.MutableRefObject<boolean>;
  isOpen: boolean;
  prompt: string;
  setLastPrompt: (prompt: string) => void;
  wasOpenRef: React.MutableRefObject<boolean>;
}) {
  const { bootedWhileOpenRef, isOpen, prompt, setLastPrompt, wasOpenRef } = args;

  useEffect(() => {
    if (isOpen) {
      wasOpenRef.current = true;
      return;
    }

    if (!wasOpenRef.current) {
      bootedWhileOpenRef.current = false;
      return;
    }

    setLastPrompt(prompt);
    wasOpenRef.current = false;
    bootedWhileOpenRef.current = false;
  }, [bootedWhileOpenRef, isOpen, prompt, setLastPrompt, wasOpenRef]);
}
