import type { AiProvidersDataState } from '../data-state';
import type { AiSecretProtectionDataState } from '../secret-protection-state';
import type { LoadedAiProvidersRuntimeData } from './runtime-data';

export function applyLoadedAiProvidersRuntimeData(
  props: Pick<
    AiProvidersDataState,
    'setChromeAiEnabled' | 'setModels' | 'setProviders' | 'setSelectionState'
  > &
    Pick<AiSecretProtectionDataState, 'setSecretProtectionStatus'>,
  loaded: LoadedAiProvidersRuntimeData
) {
  const [
    loadedProviders,
    loadedModels,
    loadedSelectorProviders,
    loadedSelectorModels,
    _loadedPrompt,
    _loadedScenarioEditorPrompt,
    loadedChromeAiEnabled,
    loadedSecretProtectionStatus,
  ] = loaded;

  props.setProviders(loadedProviders);
  props.setModels(loadedModels);
  props.setSelectionState({
    models: loadedSelectorModels,
    providers: loadedSelectorProviders,
  });
  props.setChromeAiEnabled(loadedChromeAiEnabled);
  props.setSecretProtectionStatus(loadedSecretProtectionStatus);

  return { loadedModels: loadedSelectorModels };
}
