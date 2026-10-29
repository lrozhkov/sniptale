import { useEffect } from 'react';

export interface AIModalOpenBootstrapEffectProps {
  bootedWhileOpenRef: React.MutableRefObject<boolean>;
  isOpen: boolean;
  lastPrompt: string;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function useAIModalOpenBootstrapEffect(args: AIModalOpenBootstrapEffectProps) {
  const { bootedWhileOpenRef, isOpen, lastPrompt, prompt, setPrompt, textareaRef } = args;

  useEffect(() => {
    if (!isOpen || bootedWhileOpenRef.current) return;
    bootedWhileOpenRef.current = true;
    if (!prompt && lastPrompt) setPrompt(lastPrompt);
    const focusTimeout = window.setTimeout(() => textareaRef.current?.focus(), 100);
    return () => window.clearTimeout(focusTimeout);
  }, [bootedWhileOpenRef, isOpen, lastPrompt, prompt, setPrompt, textareaRef]);
}
