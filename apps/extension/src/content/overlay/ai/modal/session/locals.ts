import { useRef, useState } from 'react';
import { useAIScenarioModelSelection } from '../../../../../workflows/ai-settings/use-scenario-model-selection';
import type { AIModalTemplateDraft } from '../shell/types';

export function useAIModalSettingsState(enabled = false) {
  const selection = useAIScenarioModelSelection('page-extract', enabled);
  return {
    availableModels: selection.configuration?.models ?? [],
    globalSystemPrompt: selection.configuration?.globalSystemPrompt ?? '',
    providers: selection.configuration?.providers ?? [],
    selectedModelId: selection.modelId,
    selection,
  };
}

export function useAIModalEditorState() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AIModalTemplateDraft | undefined>(
    undefined
  );

  return { editingTemplate, isEditorOpen, setEditingTemplate, setIsEditorOpen };
}

export function useAIModalResizeState() {
  const [isResizing, setIsResizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  return { isResizing, resizerRef, setIsResizing, textareaRef };
}
