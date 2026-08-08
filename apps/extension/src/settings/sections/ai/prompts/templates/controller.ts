import { useTemplateActions } from './actions';
import { useTemplateDeleteState } from './delete-state';
import { useTemplateEditorState } from './editor-state';
import { usePromptTemplates } from '../../../../../features/prompt-templates/hooks/use-prompt-templates';

/**
 * Owns settings prompt template CRUD and modal flows.
 */
export function useTemplatesSection() {
  const { templates, isLoading, isMutating, error, addTemplate, updateTemplate, removeTemplate } =
    usePromptTemplates();
  const editorState = useTemplateEditorState();
  const deleteState = useTemplateDeleteState();
  const { confirmDelete, handleSaveTemplate } = useTemplateActions(
    editorState.editingTemplate === undefined
      ? {
          addTemplate,
          closeDeleteDialog: deleteState.closeDeleteDialog,
          closeTemplateEditor: editorState.closeTemplateEditor,
          confirmState: deleteState.confirmState,
          removeTemplate,
          updateTemplate,
        }
      : {
          addTemplate,
          closeDeleteDialog: deleteState.closeDeleteDialog,
          closeTemplateEditor: editorState.closeTemplateEditor,
          confirmState: deleteState.confirmState,
          editingTemplate: editorState.editingTemplate,
          removeTemplate,
          updateTemplate,
        }
  );

  return {
    confirmDelete,
    confirmState: deleteState.confirmState,
    editingTemplate: editorState.editingTemplate,
    handleDeleteTemplate: deleteState.openDeleteDialog,
    handleEditTemplate: editorState.openTemplateEditor,
    handleSaveTemplate,
    isEditorOpen: editorState.isEditorOpen,
    isLoading: isLoading || isMutating,
    submitError: error,
    templates,
    closeDeleteDialog: deleteState.closeDeleteDialog,
    closeTemplateEditor: editorState.closeTemplateEditor,
    openNewTemplateEditor: editorState.openNewTemplateEditor,
  };
}
