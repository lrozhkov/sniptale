import { useCallback, useState, type SetStateAction } from 'react';

import { selectLastPrompt, useAIModalStore } from '../../../state/ai-modal.store';
import { useAIModalEditorState, useAIModalResizeState, useAIModalSettingsState } from './locals';
import { usePromptTemplates } from './prompt-template-state';
import { useAIModalTotalTokens } from './tokens';

export function useAIModalCoreState() {
  const lastPrompt = useAIModalStore(selectLastPrompt);
  const setLastPrompt = useAIModalStore((state) => state.setLastPrompt);
  const [prompt, setPromptValue] = useState(lastPrompt);
  const [selectedData, setSelectedData] = useState('');
  const editor = useAIModalEditorState();
  const settings = useAIModalSettingsState();
  const resize = useAIModalResizeState();
  const templatesState = usePromptTemplates();
  const totalTokens = useAIModalTotalTokens({
    availableModels: settings.availableModels,
    globalSystemPrompt: settings.globalSystemPrompt,
    prompt,
    selectedData,
    selectedModelId: settings.selectedModelId,
  });

  const setPrompt = useCallback(
    (nextPrompt: SetStateAction<string>) => {
      setPromptValue((previousPrompt) => {
        const resolvedPrompt =
          typeof nextPrompt === 'function' ? nextPrompt(previousPrompt) : nextPrompt;
        setLastPrompt(resolvedPrompt);
        return resolvedPrompt;
      });
    },
    [setLastPrompt]
  );

  return {
    editor,
    lastPrompt,
    prompt,
    resize,
    selectedData,
    setLastPrompt,
    setPrompt,
    setSelectedData,
    settings,
    templatesState,
    totalTokens,
  };
}

export type AIModalCoreState = ReturnType<typeof useAIModalCoreState>;
