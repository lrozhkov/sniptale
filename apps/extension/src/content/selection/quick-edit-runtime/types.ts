import type { EditableElement } from '../../../features/highlighter/contracts';

export interface QuickEditRuntimeOptions {
  onDisableRequested: () => void;
}

export interface QuickEditRuntimeModeSurface {
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
}

interface QuickEditRuntimeDocumentModeSurface {
  enable: () => void;
  disable: () => void;
  isEnabled: () => boolean;
}

export interface QuickEditRuntimeEditingSurface {
  getEditingElements: () => Map<string, EditableElement>;
}

export interface QuickEditRuntimeController {
  documentMode: QuickEditRuntimeDocumentModeSurface;
  editing: QuickEditRuntimeEditingSurface;
  mode: QuickEditRuntimeModeSurface;
}
