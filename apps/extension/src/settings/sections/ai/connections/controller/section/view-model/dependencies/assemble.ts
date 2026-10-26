import type { AiProvidersSectionControllerBuildProps } from '../build';
import type { AiProvidersSectionState } from '../../../types';
import { getAiProvidersSectionProviderName } from '../../provider-name';
import { createAiProvidersModelMoveHandler } from '../../../model-order';

export function buildAiProvidersSectionControllerDependencies(
  props: Pick<
    AiProvidersSectionControllerBuildProps,
    'chromeAi' | 'reloadData' | 'secretProtection'
  > & {
    dataState: AiProvidersSectionControllerBuildProps['dataState'];
    deleteHandlers: {
      handleDeleteModel: AiProvidersSectionState['catalogActions']['deleteModel'];
      handleDeleteProvider: AiProvidersSectionState['catalogActions']['deleteProvider'];
    };
    handleClearProviderSecret: AiProvidersSectionState['catalogActions']['clearProviderSecret'];
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
    catalogActions: {
      clearProviderSecret: props.handleClearProviderSecret,
      deleteModel: props.deleteHandlers.handleDeleteModel,
      deleteProvider: props.deleteHandlers.handleDeleteProvider,
      moveModel: createAiProvidersModelMoveHandler(props.reloadData),
    },
    dataState: {
      isLoading: props.dataState.isLoading,
      models: props.dataState.models,
      providers: props.dataState.providers,
      selection: props.dataState.selection,
    },
    chromeAi: props.chromeAi,
    secretProtection: props.secretProtection,
    getProviderName,
    modalState: props.modalState,
    reloadData: props.reloadData,
  };
}
