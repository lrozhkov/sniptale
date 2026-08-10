import type { AIModalProps } from '../shell/types';
import { useAIModalBootEffect } from './boot';
import { useAIModalCoreState } from './core-state';
import {
  createModelSelectHandler,
  createResizeStartHandler,
  createTemplateSelectHandler,
} from './selection';
import { createTemplateAddHandler, createTemplateEditHandler } from './template-editor';
import { createTemplateDeleteHandler, createTemplateSaveHandler } from './template-persistence';
import { buildAIModalState } from './view-state';
import type { AIModalCoreState } from './core-state';
import { useAIModalPromptVoiceInput } from './prompt-voice-input';

function createAIModalActions(core: AIModalCoreState, stopVoiceInput: () => void) {
  return {
    handleAddTemplate: createTemplateAddHandler({
      setEditingTemplate: core.editor.setEditingTemplate,
      setIsEditorOpen: core.editor.setIsEditorOpen,
    }),
    handleDeleteTemplate: createTemplateDeleteHandler(core.templatesState.templateLifecycle.remove),
    handleEditTemplate: createTemplateEditHandler({
      setEditingTemplate: core.editor.setEditingTemplate,
      setIsEditorOpen: core.editor.setIsEditorOpen,
    }),
    handleModelSelect: createModelSelectHandler(core.settings.setSelectedModelId),
    handleResizeStart: createResizeStartHandler({
      setIsResizing: core.resize.setIsResizing,
      textareaRef: core.resize.textareaRef,
    }),
    handleSaveTemplate: createTemplateSaveHandler({
      addTemplate: core.templatesState.addTemplate,
      editingTemplate: core.editor.editingTemplate,
      updateTemplate: core.templatesState.updateTemplate,
    }),
    handleSelectTemplate: createTemplateSelectHandler({
      selectTemplate: core.templatesState.selectTemplate,
      setPrompt: core.setPrompt,
      stopVoiceInput,
      textareaRef: core.resize.textareaRef,
    }),
  };
}

export function useAIModalState({ isOpen, isLoading }: Pick<AIModalProps, 'isOpen' | 'isLoading'>) {
  const core = useAIModalCoreState();
  const voice = useAIModalPromptVoiceInput({
    enabled: isOpen && !isLoading,
    setPrompt: core.setPrompt,
  });

  useAIModalBootEffect({
    isOpen,
    lastPrompt: core.lastPrompt,
    prompt: core.prompt,
    setAvailableModels: core.settings.setAvailableModels,
    setGlobalSystemPrompt: core.settings.setGlobalSystemPrompt,
    setLastPrompt: core.setLastPrompt,
    setPrompt: core.setPrompt,
    setProviders: core.settings.setProviders,
    setSelectedModelId: core.settings.setSelectedModelId,
    textareaRef: core.resize.textareaRef,
  });

  const actions = createAIModalActions(core, voice.actions.stop);

  return buildAIModalState({
    editor: core.editor,
    ...actions,
    prompt: core.prompt,
    resize: core.resize,
    selectedData: core.selectedData,
    settings: core.settings,
    setPrompt: core.setPrompt,
    setSelectedData: core.setSelectedData,
    templateSubmitError: core.templatesState.error,
    templates: core.templatesState.templates,
    templatesLoading: core.templatesState.isLoading || core.templatesState.isMutating,
    totalTokens: core.totalTokens,
    voice,
  });
}
