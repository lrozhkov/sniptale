import { useCallback, useState } from 'react';
import type { AIModel, AIProvider } from '../../../../../../contracts/settings';

export type AiProvidersDataState = {
  setChromeAiEnabled: (value: boolean) => void;
  setIsLoading: (value: boolean) => void;
  setModels: (value: AIModel[]) => void;
  setProviders: (value: AIProvider[]) => void;
  setSelectionState: (value: { models: AIModel[]; providers: AIProvider[] }) => void;
};

export function useAiProvidersDataState() {
  const [chromeAiEnabled, setChromeAiEnabled] = useState(false);
  const [providers, setProviders] = useState<AIProvider[]>([]);
  const [models, setModels] = useState<AIModel[]>([]);
  const [selectorProviders, setSelectorProviders] = useState<AIProvider[]>([]);
  const [selectorModels, setSelectorModels] = useState<AIModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const setSelectionState = useCallback((value: { models: AIModel[]; providers: AIProvider[] }) => {
    setSelectorModels(value.models);
    setSelectorProviders(value.providers);
  }, []);

  return {
    chromeAiEnabled,
    isLoading,
    models,
    providers,
    selection: {
      models: selectorModels,
      providers: selectorProviders,
    },
    setChromeAiEnabled,
    setIsLoading,
    setModels,
    setProviders,
    setSelectionState,
  };
}
