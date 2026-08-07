import type {
  StepBadgePreset,
  StepBadgePresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/step-badge';

export type StepBadgePresetCatalogController = {
  catalog: StepBadgePresetCatalog | null;
  draggedId: string | null;
  dragOverId: string | null;
  editor: { isOpen: boolean; preset?: StepBadgePreset };
  error: boolean;
  hoveredId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  actions: {
    add: () => void;
    closeEditor: () => void;
    delete: (preset: StepBadgePreset) => Promise<void>;
    dragEnd: () => void;
    dragLeave: () => void;
    dragOver: (event: React.DragEvent, id: string) => void;
    dragStart: (event: React.DragEvent, id: string) => void;
    drop: (event: React.DragEvent, id: string) => Promise<void>;
    edit: (preset: StepBadgePreset) => void;
    hover: (id: string | null) => void;
    reset: (id: string) => Promise<void>;
    save: (preset: StepBadgePreset) => Promise<void>;
    setDefault: (id: string) => Promise<void>;
    toggle: (id: string) => Promise<void>;
  };
};
