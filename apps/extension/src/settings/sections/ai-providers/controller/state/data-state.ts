import { useCallback, useRef, useState } from 'react';
import type { AIModel, AIProvider } from '../../../../../contracts/settings';

export type AiProvidersDataState = {
  setChromeAiEnabled: (value: boolean) => void;
  setDefaultModelId: (value: string | null) => void;
  setGlobalPromptState: (value: string) => void;
  setIsLoading: (value: boolean) => void;
  setModels: (value: AIModel[]) => void;
  setProviders: (value: AIProvider[]) => void;
  setSelectionState: (value: { models: AIModel[]; providers: AIProvider[] }) => void;
  setScenarioEditorPromptState: (value: string) => void;
};

export function useAiProvidersDataState() {
  const [chromeAiEnabled, setChromeAiEnabled] = useState(false);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectorProviders, setSelectorProviders] = useState<AIProvider[]>([]);
  const [selectorModels, setSelectorModels] = useState<AIModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState<string | null>(null);
  const [globalPrompt, setGlobalPromptState] = useState('');
  const [scenarioEditorPrompt, setScenarioEditorPromptState] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const globalPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const scenarioEditorPromptRef = useRef<HTMLTextAreaElement | null>(null);
  const setSelectionState = useCallback((value: { models: AIModel[]; providers: AIProvider[] }) => {
    setSelectorModels(value.models);
    setSelectorProviders(value.providers);
  }, []);

  return {
    chromeAiEnabled,
    defaultModelId,
    globalPrompt,
    globalPromptRef,
    isLoading,
    models,
    providers,
    scenarioEditorPrompt,
    scenarioEditorPromptRef,
    selection: {
      models: selectorModels,
      providers: selectorProviders,
    },
    setChromeAiEnabled,
    setDefaultModelId,
    setGlobalPromptState,
    setIsLoading,
    setModels,
    setProviders,
    setSelectionState,
    setScenarioEditorPromptState,
  };
}
