import { useCallback, useRef, useState, type SetStateAction } from 'react';

import { selectLastPrompt, useAIModalStore } from '../../../state/ai-modal.store';
import { usePromptTemplates } from '../../../../../features/prompt-templates/hooks/use-prompt-templates';
import { useAIModalEditorState, useAIModalResizeState, useAIModalSettingsState } from './locals';
import { useAIModalTotalTokens } from './tokens';

export function useAIModalCoreState() {
  const lastPrompt = useAIModalStore(selectLastPrompt);
  const setLastPrompt = useAIModalStore((state) => state.setLastPrompt);
  const [prompt, setPromptValue] = useState(lastPrompt);
  const promptRef = useRef(lastPrompt);
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
      const resolvedPrompt =
        typeof nextPrompt === 'function' ? nextPrompt(promptRef.current) : nextPrompt;
      promptRef.current = resolvedPrompt;
      setPromptValue(resolvedPrompt);
      setLastPrompt(resolvedPrompt);
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
