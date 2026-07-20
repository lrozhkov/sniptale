import { useState } from 'react';

import type { PromptTemplate } from '../../../contracts/settings';

export function useTemplateEditorState() {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<
    { id: string; name: string; content: string } | undefined
  >(undefined);

  return {
    closeTemplateEditor: () => {
      setIsEditorOpen(false);
    },
    editingTemplate,
    isEditorOpen,
    openNewTemplateEditor: () => {
      setEditingTemplate(undefined);
      setIsEditorOpen(true);
    },
    openTemplateEditor: (template: PromptTemplate) => {
      setEditingTemplate({ id: template.id, name: template.name, content: template.content });
      setIsEditorOpen(true);
    },
  };
}
