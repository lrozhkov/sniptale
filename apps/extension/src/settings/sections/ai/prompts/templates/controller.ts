import { useTemplateActions } from './actions';
import { useTemplateDeleteState } from './delete-state';
import { useTemplateEditorState } from './editor-state';
import { usePromptTemplates } from '../../../../../features/prompt-templates/hooks/use-prompt-templates';

/**
 * Owns settings prompt template CRUD and modal flows.
 */
export function useTemplatesSection() {
  const {
    templates,
    isLoading,
    isMutating,
    error,
    addTemplate,
    updateTemplate,
    templateLifecycle,
  } = usePromptTemplates();
  const editorState = useTemplateEditorState();
  const deleteState = useTemplateDeleteState();
  const { confirmDelete, handleResetTemplate, handleSaveTemplate } = useTemplateActions(
    editorState.editingTemplate === undefined
      ? {
          addTemplate,
          closeDeleteDialog: deleteState.closeDeleteDialog,
          closeTemplateEditor: editorState.closeTemplateEditor,
          confirmState: deleteState.confirmState,
          removeTemplate: templateLifecycle.remove,
          resetTemplate: templateLifecycle.restoreSystem,
          updateTemplate,
        }
      : {
          addTemplate,
          closeDeleteDialog: deleteState.closeDeleteDialog,
          closeTemplateEditor: editorState.closeTemplateEditor,
          confirmState: deleteState.confirmState,
          editingTemplate: editorState.editingTemplate,
          removeTemplate: templateLifecycle.remove,
          resetTemplate: templateLifecycle.restoreSystem,
          updateTemplate,
        }
  );

  return {
    confirmDelete,
    confirmState: deleteState.confirmState,
    editingTemplate: editorState.editingTemplate,
    handleEditTemplate: editorState.openTemplateEditor,
    handleSaveTemplate,
    templateLifecycle: {
      move: templateLifecycle.move,
      requestDelete: deleteState.openDeleteDialog,
      restore: handleResetTemplate,
      setEnabled: templateLifecycle.setEnabled,
    },
    isEditorOpen: editorState.isEditorOpen,
    status: { isLoading, isMutating, submitError: error },
    templates,
    closeDeleteDialog: deleteState.closeDeleteDialog,
    closeTemplateEditor: editorState.closeTemplateEditor,
    openNewTemplateEditor: editorState.openNewTemplateEditor,
  };
}
