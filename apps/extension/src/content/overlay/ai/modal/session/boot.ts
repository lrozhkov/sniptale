import { useRef } from 'react';
import type { AIModalOpenBootstrapEffectProps } from './open';
import { useAIModalOpenBootstrapEffect } from './open';
import { useAIModalPromptPersistenceEffect } from './prompt-persistence';

interface AIModalBootEffectProps extends Omit<
  AIModalOpenBootstrapEffectProps,
  'bootedWhileOpenRef'
> {
  setLastPrompt: (prompt: string) => void;
}

export function useAIModalBootEffect(props: AIModalBootEffectProps) {
  const {
    isOpen,
    lastPrompt,
    prompt,
    setAvailableModels,
    setGlobalSystemPrompt,
    setLastPrompt,
    setPrompt,
    setProviders,
    setSelectedModelId,
    textareaRef,
  } = props;
  const wasOpenRef = useRef(false);
  const bootedWhileOpenRef = useRef(false);

  useAIModalPromptPersistenceEffect({
    bootedWhileOpenRef,
    isOpen,
    prompt,
    setLastPrompt,
    wasOpenRef,
  });
  useAIModalOpenBootstrapEffect({
    bootedWhileOpenRef,
    isOpen,
    lastPrompt,
    prompt,
    setAvailableModels,
    setGlobalSystemPrompt,
    setPrompt,
    setProviders,
    setSelectedModelId,
    textareaRef,
  });
}
