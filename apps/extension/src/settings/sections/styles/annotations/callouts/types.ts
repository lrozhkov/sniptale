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
  draggedId: string | null;
  dragOverId: string | null;
  editor: CalloutPresetEditorState;
  error: boolean;
  hoveredId: string | null;
  isLoading: boolean;
  isSaving: boolean;
  actions: {
    add: () => void;
    closeEditor: () => void;
    delete: (preset: CalloutPreset) => Promise<void>;
    dragEnd: () => void;
    dragLeave: () => void;
    dragOver: (event: CalloutPresetDragEvent, id: string) => void;
    dragStart: (event: CalloutPresetDragEvent, id: string) => void;
    drop: (event: CalloutPresetDragEvent, id: string) => Promise<void>;
    edit: (preset: CalloutPreset) => void;
    hover: (id: string | null) => void;
    reset: (id: string) => Promise<void>;
    save: (preset: CalloutPreset) => Promise<void>;
    setDefault: (id: string) => Promise<void>;
    toggle: (id: string) => Promise<void>;
  };
};

type CalloutPresetDragEvent = {
  dataTransfer: { effectAllowed: string };
  preventDefault: () => void;
};
