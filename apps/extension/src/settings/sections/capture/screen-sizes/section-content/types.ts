import type { ViewportPreset } from '../../../../../contracts/settings';
import type { ViewportPresetDraft } from '../helpers';

export type PresetsSectionContentProps = {
  defaultField: {
    onChange: (id: string | null) => Promise<void>;
    selectedPresetId: string | null;
  };
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
    countLabel: string;
    onDelete: (preset: ViewportPreset) => void;
    onEdit: (preset: ViewportPreset) => void;
    onMoveBefore: (presetId: string, beforePresetId: string | null) => Promise<void>;
    onReset: (preset: ViewportPreset) => Promise<void>;
    onToggle: (preset: ViewportPreset) => Promise<void>;
    onSetDefault: (presetId: string | null) => Promise<void>;
  };
  model: {
    isLoading: boolean;
    presets: ViewportPreset[];
  };
};
