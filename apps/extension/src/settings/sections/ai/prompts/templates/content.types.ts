import type { PromptTemplate } from '../../../../../contracts/settings';

export interface TemplatesSectionContentProps {
  closeDeleteDialog: () => void;
  closeTemplateEditor: () => void;
  confirmDelete: () => Promise<void>;
  confirmState: { isOpen: boolean; template: PromptTemplate | null };
  editingTemplate?: { id: string; name: string; content: string };
  handleEditTemplate: (template: PromptTemplate) => void;
  handleSaveTemplate: (name: string, content: string) => Promise<void>;
  templateLifecycle: {
    move: (itemId: string, beforeItemId: string | null) => Promise<void>;
    requestDelete: (template: PromptTemplate) => void;
    restore: (templateId: string) => Promise<void>;
    setEnabled: (templateId: string, enabled: boolean) => Promise<void>;
  };
  isEditorOpen: boolean;
  status: {
    isLoading: boolean;
    isMutating: boolean;
    mutatingTemplateId: string | null;
    submitError: string | null;
  };
  openNewTemplateEditor: () => void;
  templates: PromptTemplate[];
}
