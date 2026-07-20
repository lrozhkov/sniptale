import { useState } from 'react';
import type { AIModel } from '../../../../../contracts/settings';

type ModelModalState = { open: boolean; model?: AIModel | null };

type ModelModalController = {
  closeModelModal: () => void;
  modelModal: ModelModalState;
  openModelModal: (model?: AIModel) => void;
};

export function useModelModalState(): ModelModalController {
  const [open, setOpen] = useState(false);
  const [model, setModel] = useState<AIModel | null>(null);

  return {
    closeModelModal: () => {
      setModel(null);
      setOpen(false);
    },
    modelModal: open ? { open: true, model } : { open: false },
    openModelModal: (nextModel?: AIModel) => {
      setModel(nextModel ?? null);
      setOpen(true);
    },
  };
}
