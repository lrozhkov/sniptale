import type { ViewportPreset } from '../../../../contracts/settings';
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
    hoveredPresetId: string | null;
    onDelete: (preset: ViewportPreset) => void;
    onEdit: (preset: ViewportPreset) => void;
    onHoverChange: (id: string | null) => void;
    onMove: (presetId: string, direction: -1 | 1) => Promise<void>;
    onReset: (preset: ViewportPreset) => Promise<void>;
    onToggle: (preset: ViewportPreset) => Promise<void>;
  };
  model: {
    isLoading: boolean;
    presets: ViewportPreset[];
  };
};
