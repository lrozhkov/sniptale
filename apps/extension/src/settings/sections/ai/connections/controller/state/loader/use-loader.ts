import { useCallback, useEffect, useRef } from 'react';
import { refreshManagedAICatalogs } from '../../../../../../../workflows/ai-settings/query';

import type { AiProvidersDataState } from '../data-state';
import type { AiSecretProtectionDataState } from '../secret-protection-state';
import { applyLoadedAiProvidersRuntimeData } from './apply-loaded-data';
import { reportAiProvidersLoaderError } from './error-handling';
import { loadAiProvidersRuntimeData } from './runtime-data';

async function reloadAiProvidersRuntimeData(
  props: {
    setChromeAiEnabled: AiProvidersDataState['setChromeAiEnabled'];
    setIsLoading: AiProvidersDataState['setIsLoading'];
    setModels: AiProvidersDataState['setModels'];
    setProviders: AiProvidersDataState['setProviders'];
    setSelectionState: AiProvidersDataState['setSelectionState'];
    setSecretProtectionStatus: AiSecretProtectionDataState['setSecretProtectionStatus'];
  },
  isCurrent: () => boolean
) {
  props.setIsLoading(true);

  try {
    const loaded = await loadAiProvidersRuntimeData();
    if (isCurrent()) applyLoadedAiProvidersRuntimeData(props, loaded);
  } catch (error) {
    if (isCurrent()) reportAiProvidersLoaderError(error);
    throw error;
  } finally {
    if (isCurrent()) props.setIsLoading(false);
  }
}

export function useAiProvidersLoader(
  props: AiProvidersDataState,
  secretProtectionState: Pick<AiSecretProtectionDataState, 'setSecretProtectionStatus'>
) {
  const { setChromeAiEnabled, setIsLoading, setModels, setProviders, setSelectionState } = props;
  const { setSecretProtectionStatus } = secretProtectionState;

  const generation = useRef(0);
  const reloadData = useCallback(async () => {
    const current = ++generation.current;
    await reloadAiProvidersRuntimeData(
      {
        setChromeAiEnabled,
        setIsLoading,
        setModels,
        setProviders,
        setSelectionState,
        setSecretProtectionStatus,
      },
      () => current === generation.current
    );
  }, [
    setIsLoading,
    setModels,
    setProviders,
    setChromeAiEnabled,
    setSelectionState,
    setSecretProtectionStatus,
  ]);

  useEffect(() => {
    let active = true;
    const current = generation.current + 1;
    void reloadData()
      .then(async () => {
        if (!active || current !== generation.current) return;
        await refreshManagedAICatalogs();
        if (active && current === generation.current) await reloadData();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [reloadData]);

  return { reloadData };
}
