import { useState } from 'react';

import { useTemplateActions } from './actions';
import { useTemplateDeleteState } from './delete-state';
import { useTemplateEditorState } from './editor-state';
import { usePromptTemplates } from './prompt-template-state';

/**
 * Owns settings prompt template CRUD, hover state, and modal flows.
 */
export function useTemplatesSection() {
  const { templates, isLoading, isMutating, error, addTemplate, updateTemplate, removeTemplate } =
    usePromptTemplates();
  const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
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
    hoveredTemplateId,
    isEditorOpen: editorState.isEditorOpen,
    isLoading: isLoading || isMutating,
    submitError: error,
    setHoveredTemplateId,
    templates,
    closeDeleteDialog: deleteState.closeDeleteDialog,
    closeTemplateEditor: editorState.closeTemplateEditor,
    openNewTemplateEditor: editorState.openNewTemplateEditor,
  };
}
