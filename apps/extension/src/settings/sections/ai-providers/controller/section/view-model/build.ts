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
  deleteHandlers: {
    handleDeleteModel: AiProvidersSectionState['handleDeleteModel'];
    handleDeleteProvider: AiProvidersSectionState['handleDeleteProvider'];
  };
  getProviderName: AiProvidersSectionState['getProviderName'];
  handleClearProviderSecret: AiProvidersSectionState['handleClearProviderSecret'];
  handleDefaultModelChange: AiProvidersSectionState['handleDefaultModelChange'];
  modalState: AiProvidersSectionState['modals'];
  prompts: AiProvidersSectionState['prompts'];
  reloadData: AiProvidersSectionState['reloadData'];
};

export function buildAiProvidersSectionControllerState(
  props: AiProvidersSectionControllerBuildProps
): AiProvidersSectionState {
  return {
    chromeAi: props.chromeAi,
    secretProtection: props.secretProtection,
    defaultModelId: props.dataState.defaultModelId,
    getProviderName: props.getProviderName,
    handleClearProviderSecret: props.handleClearProviderSecret,
    handleDeleteModel: props.deleteHandlers.handleDeleteModel,
    handleDeleteProvider: props.deleteHandlers.handleDeleteProvider,
    handleDefaultModelChange: props.handleDefaultModelChange,
    isLoading: props.dataState.isLoading,
    modelOptions: buildAiProvidersModelOptions({
      getProviderName: props.getProviderName,
      models: props.dataState.selection.models,
    }),
    models: props.dataState.models,
    modals: props.modalState,
    prompts: props.prompts,
    providers: props.dataState.providers,
    reloadData: props.reloadData,
  };
}
