import { useCallback, useState } from 'react';
import { useTemplateActions } from './actions';
import { useTemplateDeleteState } from './delete-state';
import { useTemplateEditorState } from './editor-state';
import { usePromptTemplates } from '../../../../../features/prompt-templates/hooks/use-prompt-templates';

/**
 * Owns settings prompt template CRUD and modal flows.
 */
export function useTemplatesSection() {
  const [mutatingTemplateId, setMutatingTemplateId] = useState<string | null>(null);
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

  const runRowMutation = useCallback(async (templateId: string, mutation: () => Promise<void>) => {
    setMutatingTemplateId(templateId);
    try {
      await mutation();
    } finally {
      setMutatingTemplateId((current) => (current === templateId ? null : current));
    }
  }, []);

  return {
    confirmDelete,
    confirmState: deleteState.confirmState,
    editingTemplate: editorState.editingTemplate,
    handleEditTemplate: editorState.openTemplateEditor,
    handleSaveTemplate,
    templateLifecycle: {
      move: (itemId: string, beforeItemId: string | null) =>
        runRowMutation(itemId, () => templateLifecycle.move(itemId, beforeItemId)),
      requestDelete: deleteState.openDeleteDialog,
      restore: (templateId: string) =>
        runRowMutation(templateId, () => handleResetTemplate(templateId)),
      setEnabled: (templateId: string, enabled: boolean) =>
        runRowMutation(templateId, () => templateLifecycle.setEnabled(templateId, enabled)),
    },
    isEditorOpen: editorState.isEditorOpen,
    status: { isLoading, isMutating, mutatingTemplateId, submitError: error },
    templates,
    closeDeleteDialog: deleteState.closeDeleteDialog,
    closeTemplateEditor: editorState.closeTemplateEditor,
    openNewTemplateEditor: editorState.openNewTemplateEditor,
  };
}
