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
  setIsLoading: AiProvidersDataState['setIsLoading'];
  setModels: AiProvidersDataState['setModels'];
  setProviders: AiProvidersDataState['setProviders'];
  setSelectionState: AiProvidersDataState['setSelectionState'];
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
    setIsLoading,
    setModels,
    setProviders,
    setSelectionState,
  } = props;
  const { setSecretProtectionStatus } = secretProtectionState;

  const reloadData = useCallback(async () => {
    await reloadAiProvidersRuntimeData({
      setChromeAiEnabled,
      setDefaultModelId,
      setIsLoading,
      setModels,
      setProviders,
      setSelectionState,
      setSecretProtectionStatus,
    });
  }, [
    setDefaultModelId,
    setIsLoading,
    setModels,
    setProviders,
    setChromeAiEnabled,
    setSelectionState,
    setSecretProtectionStatus,
  ]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  return { reloadData };
}
