import { useState } from 'react';

import type { AiProvidersPromptResetResult, AiProvidersPromptViewState } from './types';

export function useAiProvidersPromptState(args: {
  defaultValue: string;
  persist: (value: string) => Promise<string | null>;
  persistedValue: string;
  reset: () => Promise<AiProvidersPromptResetResult>;
  value: string;
  textareaRef: AiProvidersPromptViewState['textareaRef'];
  setSourceValue: (value: string) => void;
  setPersistedValue: (value: string) => void;
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
        if (errorMessage === null) args.setPersistedValue(args.value);
      } finally {
        setIsSaving(false);
      }
    },
    handleReset: async () => {
      setIsSaving(true);
      setSaveError(null);
      try {
        const result = await args.reset();
        setSaveError(result.error);
        if (result.error === null) {
          args.setSourceValue(args.defaultValue);
          args.setPersistedValue(args.defaultValue);
        }
      } finally {
        setIsSaving(false);
      }
    },
    status: {
      canReset: args.persistedValue !== args.defaultValue,
      isDirty: args.value !== args.persistedValue,
      isSaving,
      saveError,
    },
    setValue: (value) => {
      setSaveError(null);
      args.setSourceValue(value);
    },
    textareaRef: args.textareaRef,
    value: args.value,
  };
}
