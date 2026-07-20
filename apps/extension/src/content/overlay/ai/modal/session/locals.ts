import { useRef, useState } from 'react';
import type { AIProviderSelectorEntry } from '../../../../../contracts/messaging/ai-settings-runtime';
import type { AIModel } from '../../../../../contracts/settings';
import type { AIModalTemplateDraft } from '../shell/types';

export function useAIModalSettingsState() {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState('');
  const [providers, setProviders] = useState<AIProviderSelectorEntry[]>([]);

  return {
    availableModels,
    globalSystemPrompt,
    providers,
    selectedModelId,
    setAvailableModels,
    setGlobalSystemPrompt,
    setProviders,
    setSelectedModelId,
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
