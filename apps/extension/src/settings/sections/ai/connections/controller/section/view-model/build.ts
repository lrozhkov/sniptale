import { buildAiProvidersModelOptions } from '../../model-options';
import type { AiProvidersSectionState } from '../../types';

export type AiProvidersSectionControllerBuildProps = {
  dataState: {
    defaultModelId: string | null;
    isLoading: boolean;
    models: AiProvidersSectionState['models'];
    providers: AiProvidersSectionState['providers'];
    selection: {
      models: AiProvidersSectionState['models'];
      providers: AiProvidersSectionState['providers'];
    };
  };
  chromeAi: AiProvidersSectionState['chromeAi'];
  secretProtection: AiProvidersSectionState['secretProtection'];
  catalogActions: AiProvidersSectionState['catalogActions'];
  getProviderName: AiProvidersSectionState['getProviderName'];
  modalState: AiProvidersSectionState['modals'];
  reloadData: AiProvidersSectionState['reloadData'];
};

export function buildAiProvidersSectionControllerState(
  props: AiProvidersSectionControllerBuildProps
): AiProvidersSectionState {
  return {
    catalogActions: props.catalogActions,
    chromeAi: props.chromeAi,
    secretProtection: props.secretProtection,
    defaultModelId: props.dataState.defaultModelId,
    getProviderName: props.getProviderName,
    isLoading: props.dataState.isLoading,
    modelOptions: buildAiProvidersModelOptions({
      getProviderName: props.getProviderName,
      models: props.dataState.selection.models,
    }),
    models: props.dataState.models,
    modals: props.modalState,
    providers: props.dataState.providers,
    reloadData: props.reloadData,
  };
}
