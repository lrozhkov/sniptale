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

function createAIModalActions(core: AIModalCoreState) {
  return {
    handleAddTemplate: createTemplateAddHandler({
      setEditingTemplate: core.editor.setEditingTemplate,
      setIsEditorOpen: core.editor.setIsEditorOpen,
    }),
    handleDeleteTemplate: createTemplateDeleteHandler(core.templatesState.removeTemplate),
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
      textareaRef: core.resize.textareaRef,
    }),
  };
}

export function useAIModalState({ isOpen }: Pick<AIModalProps, 'isOpen'>) {
  const core = useAIModalCoreState();

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

  const actions = createAIModalActions(core);

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
  });
}
