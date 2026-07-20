import type { AiProvidersDeleteState } from '../../types';
import { useDeleteState } from '../delete-state';
import { useModelModalState } from '../model-modal';
import { useProviderModalState } from '../provider-modal';

type AiProvidersModalState = {
  closeModelModal: () => void;
  closeProviderModal: () => void;
  confirmDelete: AiProvidersDeleteState;
  modelModal: ReturnType<typeof useModelModalState>['modelModal'];
  openModelModal: ReturnType<typeof useModelModalState>['openModelModal'];
  openProviderModal: ReturnType<typeof useProviderModalState>['openProviderModal'];
  providerModal: ReturnType<typeof useProviderModalState>['providerModal'];
  setConfirmDelete: ReturnType<typeof useDeleteState>['setConfirmDelete'];
};

export function useAiProvidersModalState(): AiProvidersModalState {
  const providerModal = useProviderModalState();
  const modelModal = useModelModalState();
  const deleteState = useDeleteState();

  return {
    closeModelModal: modelModal.closeModelModal,
    closeProviderModal: providerModal.closeProviderModal,
    confirmDelete: deleteState.confirmDelete,
    modelModal: modelModal.modelModal,
    openModelModal: modelModal.openModelModal,
    openProviderModal: providerModal.openProviderModal,
    providerModal: providerModal.providerModal,
    setConfirmDelete: deleteState.setConfirmDelete,
  };
}
