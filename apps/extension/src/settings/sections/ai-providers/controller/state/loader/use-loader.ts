import { useCallback, useEffect } from 'react';

import type { AiProvidersDataState } from '../data-state';
import type { AiSecretProtectionDataState } from '../secret-protection-state';
import { applyLoadedAiProvidersRuntimeData } from './apply-loaded-data';
import { ensureDefaultAiProvidersModel } from './default-model';
import { reportAiProvidersLoaderError } from './error-handling';
import { loadAiProvidersRuntimeData } from './runtime-data';

async function reloadAiProvidersRuntimeData(props: {
  setChromeAiEnabled: AiProvidersDataState['setChromeAiEnabled'];
  setDefaultModelId: AiProvidersDataState['setDefaultModelId'];
  setGlobalPromptState: AiProvidersDataState['setGlobalPromptState'];
  setIsLoading: AiProvidersDataState['setIsLoading'];
  setModels: AiProvidersDataState['setModels'];
  setProviders: AiProvidersDataState['setProviders'];
  setSelectionState: AiProvidersDataState['setSelectionState'];
  setScenarioEditorPromptState: AiProvidersDataState['setScenarioEditorPromptState'];
  setSecretProtectionStatus: AiSecretProtectionDataState['setSecretProtectionStatus'];
}) {
  props.setIsLoading(true);

  try {
    const loaded = await loadAiProvidersRuntimeData();
    const { loadedDefaultId, loadedModels } = applyLoadedAiProvidersRuntimeData(props, loaded);
    await ensureDefaultAiProvidersModel(loadedDefaultId, loadedModels, props.setDefaultModelId);
  } catch (error) {
    reportAiProvidersLoaderError(error);
  } finally {
    props.setIsLoading(false);
  }
}

export function useAiProvidersLoader(
  props: AiProvidersDataState,
  secretProtectionState: Pick<AiSecretProtectionDataState, 'setSecretProtectionStatus'>
) {
  const {
    setChromeAiEnabled,
    setDefaultModelId,
    setGlobalPromptState,
    setIsLoading,
    setModels,
    setProviders,
    setSelectionState,
    setScenarioEditorPromptState,
  } = props;
  const { setSecretProtectionStatus } = secretProtectionState;

  const reloadData = useCallback(async () => {
    await reloadAiProvidersRuntimeData({
      setChromeAiEnabled,
      setDefaultModelId,
      setGlobalPromptState,
      setIsLoading,
      setModels,
      setProviders,
      setSelectionState,
      setScenarioEditorPromptState,
      setSecretProtectionStatus,
    });
  }, [
    setDefaultModelId,
    setGlobalPromptState,
    setIsLoading,
    setModels,
    setProviders,
    setChromeAiEnabled,
    setSelectionState,
    setScenarioEditorPromptState,
    setSecretProtectionStatus,
  ]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  return { reloadData };
}
