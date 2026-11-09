import type { AiProvidersDataState } from '../data-state';
import type { LoadedAiProvidersRuntimeData } from './runtime-data';

export function applyLoadedAiProvidersRuntimeData(
  props: Pick<
    AiProvidersDataState,
    'setChromeAiEnabled' | 'setModels' | 'setProviders' | 'setSelectionState'
  >,
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
  ] = loaded;

  props.setProviders(loadedProviders);
  props.setModels(loadedModels);
  props.setSelectionState({
    models: loadedSelectorModels,
    providers: loadedSelectorProviders,
  });
  props.setChromeAiEnabled(loadedChromeAiEnabled);

  return { loadedModels: loadedSelectorModels };
}
