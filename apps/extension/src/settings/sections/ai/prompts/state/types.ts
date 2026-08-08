import type { MouseEvent, MutableRefObject } from 'react';

export type AiProvidersPromptViewState = {
  isSaving: boolean;
  saveError: string | null;
  value: string;
  textareaRef: MutableRefObject<HTMLTextAreaElement | null>;
  setValue: (value: string) => void;
  handleSave: () => Promise<void>;
  handleResizeStart: (event: MouseEvent) => void;
};

export type AiProvidersPromptsState = {
  global: AiProvidersPromptViewState;
  scenarioEditor: AiProvidersPromptViewState;
};

export type AiProvidersPromptSource = {
  globalPrompt: string;
  globalPromptRef: MutableRefObject<HTMLTextAreaElement | null>;
  scenarioEditorPrompt: string;
  scenarioEditorPromptRef: MutableRefObject<HTMLTextAreaElement | null>;
  setGlobalPromptState: (value: string) => void;
  setScenarioEditorPromptState: (value: string) => void;
};
