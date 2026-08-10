import type { ViewportPreset } from '../../../../../contracts/settings';
import type { ViewportPresetDraft } from '../helpers';

export type PresetsSectionContentProps = {
  deletion: {
    close: () => void;
    confirm: () => Promise<void>;
    isOpen: boolean;
    message: string;
  };
  editor: {
    close: () => void;
    editingPreset?: ViewportPreset;
    isOpen: boolean;
    onAdd: () => void;
    onSave: (draft: ViewportPresetDraft) => Promise<void>;
  };
  list: {
    onDelete: (preset: ViewportPreset) => void;
    onEdit: (preset: ViewportPreset) => void;
    onMoveBefore: (presetId: string, beforePresetId: string | null) => Promise<void>;
    onReset: (preset: ViewportPreset) => Promise<void>;
    onToggle: (preset: ViewportPreset) => Promise<void>;
  };
  model: {
    isLoading: boolean;
    isMutating: boolean;
    presets: ViewportPreset[];
  };
};
