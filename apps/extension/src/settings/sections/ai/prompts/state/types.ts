import type { MouseEvent, MutableRefObject } from 'react';

export type AiProvidersPromptViewState = {
  status: {
    canReset: boolean;
    isDirty: boolean;
    isSaving: boolean;
    saveError: string | null;
  };
  value: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setValue: (value: string) => void;
  handleSave: () => Promise<void>;
  handleReset: () => Promise<void>;
  handleResizeStart: (event: MouseEvent) => void;
};

export type AiProvidersPromptResetResult = { error: string | null };

export type AiProvidersPromptsState = {
  global: AiProvidersPromptViewState;
  scenarioEditor: AiProvidersPromptViewState;
};

export type AiProvidersPromptSource = {
  globalPrompt: string;
  globalPromptRef: MutableRefObject<HTMLTextAreaElement | null>;
  persistedGlobalPrompt: string;
  persistedScenarioEditorPrompt: string;
  scenarioEditorPrompt: string;
  scenarioEditorPromptRef: MutableRefObject<HTMLTextAreaElement | null>;
  setGlobalPromptState: (value: string) => void;
  setPersistedGlobalPrompt: (value: string) => void;
  setPersistedScenarioEditorPrompt: (value: string) => void;
  setScenarioEditorPromptState: (value: string) => void;
};
