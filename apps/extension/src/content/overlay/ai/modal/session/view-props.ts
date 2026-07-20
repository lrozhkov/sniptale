import type { createAIModalActionHandlers } from './build';
import type { AIModalCoreState } from './core-state';

export function createAIModalViewStateArgs(
  core: AIModalCoreState,
  actions: ReturnType<typeof createAIModalActionHandlers>
) {
  return {
    editor: core.editor,
    handleAddTemplate: actions.handleAddTemplate,
    handleDeleteTemplate: actions.handleDeleteTemplate,
    handleEditTemplate: actions.handleEditTemplate,
    handleModelSelect: actions.handleModelSelect,
    handleResizeStart: actions.handleResizeStart,
    handleSaveTemplate: actions.handleSaveTemplate,
    handleSelectTemplate: actions.handleSelectTemplate,
    prompt: core.prompt,
    resize: core.resize,
    selectedData: core.selectedData,
    setPrompt: core.setPrompt,
    setSelectedData: core.setSelectedData,
    settings: core.settings,
    templateSubmitError: core.templatesState.error,
    templates: core.templatesState.templates,
    templatesLoading: core.templatesState.isLoading || core.templatesState.isMutating,
    totalTokens: core.totalTokens,
  };
}
