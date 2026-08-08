import type { PromptTemplate } from '../../../../../contracts/settings';

export interface TemplatesSectionContentProps {
  closeDeleteDialog: () => void;
  closeTemplateEditor: () => void;
  confirmDelete: () => Promise<void>;
  confirmState: { isOpen: boolean; template: PromptTemplate | null };
  editingTemplate?: { id: string; name: string; content: string };
  handleDeleteTemplate: (template: PromptTemplate) => void;
  handleEditTemplate: (template: PromptTemplate) => void;
  handleSaveTemplate: (name: string, content: string) => Promise<void>;
  isEditorOpen: boolean;
  isLoading: boolean;
  submitError: string | null;
  openNewTemplateEditor: () => void;
  templates: PromptTemplate[];
}
