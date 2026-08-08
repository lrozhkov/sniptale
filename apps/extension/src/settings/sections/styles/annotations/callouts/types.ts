import type {
  CalloutPreset,
  CalloutPresetCatalog,
} from '@sniptale/runtime-contracts/highlighter/callout';

type CalloutPresetEditorState = {
  isOpen: boolean;
  preset?: CalloutPreset | undefined;
};

export type CalloutPresetCatalogController = {
  catalog: CalloutPresetCatalog | null;
  editor: CalloutPresetEditorState;
  error: boolean;
  isLoading: boolean;
  isSaving: boolean;
  actions: {
    add: () => void;
    closeEditor: () => void;
    delete: (preset: CalloutPreset) => Promise<void>;
    edit: (preset: CalloutPreset) => void;
    moveBefore: (id: string, beforeId: string | null) => Promise<void>;
    reset: (id: string) => Promise<void>;
    save: (preset: CalloutPreset) => Promise<void>;
    setDefault: (id: string) => Promise<void>;
    toggle: (id: string) => Promise<void>;
  };
};
