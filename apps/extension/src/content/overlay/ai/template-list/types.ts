import type { PromptTemplate } from '../../../../contracts/settings';

export interface TemplateListProps {
  templates: PromptTemplate[];
  isLoading: boolean;
  onSelectTemplate: (template: PromptTemplate) => void;
  onEditTemplate: (template: PromptTemplate) => void;
  onDeleteTemplate: (template: PromptTemplate) => void;
  onAddTemplate: () => void;
}

export interface ConfirmState {
  isOpen: boolean;
  template: PromptTemplate | null;
}
