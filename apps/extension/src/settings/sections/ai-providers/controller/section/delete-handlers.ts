import { handleAiProvidersDelete } from '../delete-actions';
import type { AiProvidersDeleteState } from '../types';

type AiProvidersDeleteHandlers = {
  handleDeleteModel: () => Promise<void>;
  handleDeleteProvider: () => Promise<void>;
};

export function useAiProvidersDeleteHandlers(props: {
  confirmDelete: AiProvidersDeleteState;
  reloadData: () => Promise<void>;
  setConfirmDelete: (value: AiProvidersDeleteState) => void;
}): AiProvidersDeleteHandlers {
  return {
    handleDeleteModel: async () => {
      if (!props.confirmDelete || props.confirmDelete.type !== 'model') {
        return;
      }

      await handleAiProvidersDelete({
        confirmDelete: props.confirmDelete,
        reloadData: props.reloadData,
        setConfirmDelete: props.setConfirmDelete,
      });
    },
    handleDeleteProvider: async () => {
      if (!props.confirmDelete || props.confirmDelete.type !== 'provider') {
        return;
      }

      await handleAiProvidersDelete({
        confirmDelete: props.confirmDelete,
        reloadData: props.reloadData,
        setConfirmDelete: props.setConfirmDelete,
      });
    },
  };
}
