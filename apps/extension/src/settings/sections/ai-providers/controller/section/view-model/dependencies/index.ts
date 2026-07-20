import { useAiProvidersChromeAiState } from '../../../chrome-ai';
import {
  useAiProvidersDataState,
  useAiProvidersLoader,
  useAiSecretProtectionDataState,
} from '../../../state';
import type { AiProvidersSectionControllerBuildProps } from '../build';
import { useAiProvidersDeleteHandlers } from '../../delete-handlers';
import { useAiProvidersProviderSecretActions } from '../../provider-secret-actions';
import { useAiProvidersModalState } from '../../modal-state';
import { useAiProvidersPromptState } from '../../prompt-state/build';
import { useAiProvidersSecretProtectionState } from '../../secret-protection';
import { buildAiProvidersSectionControllerDependencies } from './assemble';

function buildControllerDataState(
  dataState: ReturnType<typeof useAiProvidersDataState>
): AiProvidersSectionControllerBuildProps['dataState'] & {
  setDefaultModelId: (value: string | null) => void;
} {
  return {
    defaultModelId: dataState.defaultModelId,
    isLoading: dataState.isLoading,
    models: dataState.models,
    providers: dataState.providers,
    selection: dataState.selection,
    setDefaultModelId: dataState.setDefaultModelId,
  };
}

function buildControllerModalState(
  modalState: ReturnType<typeof useAiProvidersModalState>
): AiProvidersSectionControllerBuildProps['modalState'] {
  return {
    provider: modalState.providerModal,
    model: modalState.modelModal,
    confirmDelete: modalState.confirmDelete,
    openProviderModal: modalState.openProviderModal,
    closeProviderModal: modalState.closeProviderModal,
    openModelModal: modalState.openModelModal,
    closeModelModal: modalState.closeModelModal,
    setConfirmDelete: modalState.setConfirmDelete,
  };
}

export function useAiProvidersSectionControllerDependencies(): AiProvidersSectionControllerBuildProps {
  const dataState = useAiProvidersDataState();
  const secretProtectionDataState = useAiSecretProtectionDataState();
  const modalState = useAiProvidersModalState();
  const { reloadData } = useAiProvidersLoader(dataState, secretProtectionDataState);
  const prompts = useAiProvidersPromptState(dataState);
  const secretStatus = secretProtectionDataState.secretProtectionStatus;
  const secretProtection = useAiProvidersSecretProtectionState({
    reloadData,
    status: secretStatus,
  });
  const deleteHandlers = useAiProvidersDeleteHandlers({
    confirmDelete: modalState.confirmDelete,
    reloadData,
    setConfirmDelete: modalState.setConfirmDelete,
  });
  const providerSecretActions = useAiProvidersProviderSecretActions({ reloadData });
  const chromeAi = useAiProvidersChromeAiState({
    chromeAiEnabled: dataState.chromeAiEnabled,
    defaultModelId: dataState.defaultModelId,
    models: dataState.models,
    reloadData,
    setChromeAiEnabled: dataState.setChromeAiEnabled,
    setDefaultModelId: dataState.setDefaultModelId,
  });
  return buildAiProvidersSectionControllerDependencies({
    chromeAi,
    secretProtection,
    dataState: buildControllerDataState(dataState),
    deleteHandlers,
    handleClearProviderSecret: providerSecretActions.handleClearProviderSecret,
    modalState: buildControllerModalState(modalState),
    prompts,
    reloadData,
  });
}
