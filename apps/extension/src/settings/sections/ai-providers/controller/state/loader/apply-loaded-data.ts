import type { AiProvidersDataState } from '../data-state';
import type { AiSecretProtectionDataState } from '../secret-protection-state';
import type { LoadedAiProvidersRuntimeData } from './runtime-data';

export function applyLoadedAiProvidersRuntimeData(
  props: Pick<
    AiProvidersDataState,
    | 'setChromeAiEnabled'
    | 'setDefaultModelId'
    | 'setGlobalPromptState'
    | 'setModels'
    | 'setProviders'
    | 'setSelectionState'
    | 'setScenarioEditorPromptState'
  > &
    Pick<AiSecretProtectionDataState, 'setSecretProtectionStatus'>,
  loaded: LoadedAiProvidersRuntimeData
) {
  const [
    loadedProviders,
    loadedModels,
    loadedSelectorProviders,
    loadedSelectorModels,
    loadedDefaultId,
    loadedPrompt,
    loadedScenarioEditorPrompt,
    loadedChromeAiEnabled,
    loadedSecretProtectionStatus,
  ] = loaded;

  props.setProviders(loadedProviders);
  props.setModels(loadedModels);
  props.setSelectionState({
    models: loadedSelectorModels,
    providers: loadedSelectorProviders,
  });
  props.setDefaultModelId(loadedDefaultId);
  props.setGlobalPromptState(loadedPrompt);
  props.setScenarioEditorPromptState(loadedScenarioEditorPrompt);
  props.setChromeAiEnabled(loadedChromeAiEnabled);
  props.setSecretProtectionStatus(loadedSecretProtectionStatus);

  return { loadedDefaultId, loadedModels: loadedSelectorModels };
}
