import type { AiProvidersSectionControllerBuildProps } from '../build';
import { createAiProvidersDefaultModelChangeHandler } from '../default-model';
import { getAiProvidersSectionProviderName } from '../../provider-name';

export function buildAiProvidersSectionControllerDependencies(
  props: Pick<
    AiProvidersSectionControllerBuildProps,
    'chromeAi' | 'deleteHandlers' | 'prompts' | 'reloadData' | 'secretProtection'
  > & {
    dataState: AiProvidersSectionControllerBuildProps['dataState'] & {
      setDefaultModelId: (value: string | null) => void;
    };
    handleClearProviderSecret: AiProvidersSectionControllerBuildProps['handleClearProviderSecret'];
    modalState: {
      closeModelModal: AiProvidersSectionControllerBuildProps['modalState']['closeModelModal'];
      closeProviderModal: AiProvidersSectionControllerBuildProps['modalState']['closeProviderModal'];
      confirmDelete: AiProvidersSectionControllerBuildProps['modalState']['confirmDelete'];
      model: AiProvidersSectionControllerBuildProps['modalState']['model'];
      openModelModal: AiProvidersSectionControllerBuildProps['modalState']['openModelModal'];
      openProviderModal: AiProvidersSectionControllerBuildProps['modalState']['openProviderModal'];
      provider: AiProvidersSectionControllerBuildProps['modalState']['provider'];
      setConfirmDelete: AiProvidersSectionControllerBuildProps['modalState']['setConfirmDelete'];
    };
  }
): AiProvidersSectionControllerBuildProps {
  const getProviderName = (providerId: string) =>
    getAiProvidersSectionProviderName(props.dataState.selection.providers, providerId);

  return {
    dataState: {
      defaultModelId: props.dataState.defaultModelId,
      isLoading: props.dataState.isLoading,
      models: props.dataState.models,
      providers: props.dataState.providers,
      selection: props.dataState.selection,
    },
    chromeAi: props.chromeAi,
    secretProtection: props.secretProtection,
    deleteHandlers: props.deleteHandlers,
    getProviderName,
    handleClearProviderSecret: props.handleClearProviderSecret,
    handleDefaultModelChange: createAiProvidersDefaultModelChangeHandler(
      props.dataState.setDefaultModelId
    ),
    modalState: props.modalState,
    prompts: props.prompts,
    reloadData: props.reloadData,
  };
}
