import { useState } from 'react';
import type { AIModel } from '../../../../../../contracts/settings';

type ModelModalState = { open: boolean; model?: AIModel | null; initialProviderId?: string };

type ModelModalController = {
  closeModelModal: () => void;
  modelModal: ModelModalState;
  openModelModal: (model?: AIModel, initialProviderId?: string) => void;
};

export function useModelModalState(): ModelModalController {
  const [modelModal, setModelModal] = useState<ModelModalState>({ open: false });
  return {
    closeModelModal: () => setModelModal({ open: false }),
    modelModal,
    openModelModal: (model?: AIModel, initialProviderId?: string) => {
      setModelModal({
        open: true,
        model: model ?? null,
        ...(initialProviderId ? { initialProviderId } : {}),
      });
    },
  };
}
