import { useEffect, useRef, useState } from 'react';

import { requestAISettingsPageRuntimeData } from '../../../../workflows/ai-settings/query';
import { useAiProvidersPromptState } from './state';

export function useAiPromptsController() {
  const [globalPrompt, setGlobalPromptState] = useState('');
  const [persistedGlobalPrompt, setPersistedGlobalPrompt] = useState('');
  const [scenarioEditorPrompt, setScenarioEditorPromptState] = useState('');
  const [persistedScenarioEditorPrompt, setPersistedScenarioEditorPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const globalPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const scenarioEditorPromptRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let active = true;
    void requestAISettingsPageRuntimeData()
      .then((data) => {
        if (!active) return;
        setGlobalPromptState(data.selectionBootstrap.globalSystemPrompt);
        setPersistedGlobalPrompt(data.selectionBootstrap.globalSystemPrompt);
        setScenarioEditorPromptState(data.scenarioEditorSystemPrompt);
        setPersistedScenarioEditorPrompt(data.scenarioEditorSystemPrompt);
        setError(false);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    error,
    isLoading,
    prompts: useAiProvidersPromptState({
      globalPrompt,
      globalPromptRef,
      persistedGlobalPrompt,
      persistedScenarioEditorPrompt,
      scenarioEditorPrompt,
      scenarioEditorPromptRef,
      setGlobalPromptState,
      setPersistedGlobalPrompt,
      setPersistedScenarioEditorPrompt,
      setScenarioEditorPromptState,
    }),
  };
}
