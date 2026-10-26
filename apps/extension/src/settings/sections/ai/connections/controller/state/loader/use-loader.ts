import { useCallback, useEffect } from 'react';

import type { AiProvidersDataState } from '../data-state';
import type { AiSecretProtectionDataState } from '../secret-protection-state';
import { applyLoadedAiProvidersRuntimeData } from './apply-loaded-data';
import { reportAiProvidersLoaderError } from './error-handling';
import { loadAiProvidersRuntimeData } from './runtime-data';

async function reloadAiProvidersRuntimeData(props: {
  setChromeAiEnabled: AiProvidersDataState['setChromeAiEnabled'];
  setIsLoading: AiProvidersDataState['setIsLoading'];
  setModels: AiProvidersDataState['setModels'];
  setProviders: AiProvidersDataState['setProviders'];
  setSelectionState: AiProvidersDataState['setSelectionState'];
  setSecretProtectionStatus: AiSecretProtectionDataState['setSecretProtectionStatus'];
}) {
  props.setIsLoading(true);

  try {
    const loaded = await loadAiProvidersRuntimeData();
    applyLoadedAiProvidersRuntimeData(props, loaded);
  } catch (error) {
    reportAiProvidersLoaderError(error);
    throw error;
  } finally {
    props.setIsLoading(false);
  }
}

export function useAiProvidersLoader(
  props: AiProvidersDataState,
  secretProtectionState: Pick<AiSecretProtectionDataState, 'setSecretProtectionStatus'>
) {
  const { setChromeAiEnabled, setIsLoading, setModels, setProviders, setSelectionState } = props;
  const { setSecretProtectionStatus } = secretProtectionState;

  const reloadData = useCallback(async () => {
    await reloadAiProvidersRuntimeData({
      setChromeAiEnabled,
      setIsLoading,
      setModels,
      setProviders,
      setSelectionState,
      setSecretProtectionStatus,
    });
  }, [
    setIsLoading,
    setModels,
    setProviders,
    setChromeAiEnabled,
    setSelectionState,
    setSecretProtectionStatus,
  ]);

  useEffect(() => {
    void reloadData().catch(() => undefined);
  }, [reloadData]);

  return { reloadData };
}
