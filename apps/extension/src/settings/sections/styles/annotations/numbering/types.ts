import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/step-badge';

export type StepBadgePresetCatalogController = {
  catalog: StepBadgePresetCatalog | null;
  editor: { isOpen: boolean; preset?: StepBadgePreset };
  error: boolean;
  isLoading: boolean;
  isSaving: boolean;
  actions: {
    add: () => void;
    closeEditor: () => void;
    delete: (preset: StepBadgePreset) => Promise<void>;
    edit: (preset: StepBadgePreset) => void;
    moveBefore: (id: string, beforeId: string | null) => Promise<void>;
    reset: (id: string) => Promise<void>;
    save: (preset: StepBadgePreset) => Promise<void>;
    setDefault: (id: string) => Promise<void>;
    toggle: (id: string) => Promise<void>;
  };
};
