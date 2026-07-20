import { useEffect, useState } from 'react';
import type { AIProviderSelectorEntry } from '../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../contracts/settings';
import { requestAIModelSelectionBootstrap } from '../../../workflows/ai-settings/query';

export function useScenarioAiModelBootstrapState<TRunSummary>(fallbackErrorMessage: string) {
  const [instruction, setInstruction] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [providers, setProviders] = useState<AIProviderSelectorEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRunSummary, setLastRunSummary] = useState<TRunSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    void requestAIModelSelectionBootstrap()
      .then((bootstrap) => {
        if (cancelled) {
          return;
        }

        setAvailableModels(bootstrap.models);
        setProviders(bootstrap.providers);
        setSelectedModelId(bootstrap.defaultModelId);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : fallbackErrorMessage);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [fallbackErrorMessage]);

  return {
    availableModels,
    error,
    instruction,
    lastRunSummary,
    loading,
    providers,
    selectedModelId,
    setError,
    setInstruction,
    setLastRunSummary,
    setLoading,
    setSelectedModelId,
  };
}
