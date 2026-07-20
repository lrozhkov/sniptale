import { useState } from 'react';

import type { AiProvidersPromptViewState } from './types';

export function useAiProvidersPromptState(args: {
  persist: (value: string) => Promise<string | null>;
  value: string;
  textareaRef: AiProvidersPromptViewState['textareaRef'];
  setSourceValue: (value: string) => void;
  handleResizeStart: AiProvidersPromptViewState['handleResizeStart'];
}): AiProvidersPromptViewState {
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  return {
    handleResizeStart: args.handleResizeStart,
    handleSave: async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const errorMessage = await args.persist(args.value);
        setSaveError(errorMessage);
      } finally {
        setIsSaving(false);
      }
    },
    isSaving,
    saveError,
    setValue: (value) => {
      setSaveError(null);
      args.setSourceValue(value);
    },
    textareaRef: args.textareaRef,
    value: args.value,
  };
}
