import type { ToolbarPageEditingMode } from '../types';

export function createPageEditingModeSelector(params: {
  aiPickMode: boolean;
  onAiPickContentStart: () => void;
  onToggleQuickEditDocumentMode: (enabled: boolean) => void;
  quickEditDocumentMode: boolean;
  quickEditMode: boolean;
  toggleQuickEditMode: () => Promise<boolean>;
}) {
  return async (mode: ToolbarPageEditingMode) => {
    if (mode === 'ai') {
      if (!params.aiPickMode) {
        params.onAiPickContentStart();
      }
      return;
    }

    if (!params.quickEditMode) {
      const enabled = await params.toggleQuickEditMode();
      if (!enabled) return;
    }

    const shouldUseDocumentMode = mode === 'direct-text';
    if (params.quickEditDocumentMode !== shouldUseDocumentMode) {
      params.onToggleQuickEditDocumentMode(shouldUseDocumentMode);
    }
  };
}
