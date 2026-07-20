import type { PromptTemplate } from '../../../../../contracts/settings';
import type { useTemplateListState } from '../state';

export type TemplateListState = ReturnType<typeof useTemplateListState>;

export type TemplateMenuItemsProps = {
  isLoading: boolean;
  onDelete: (template: PromptTemplate) => void;
  onEdit: (template: PromptTemplate) => void;
  template: PromptTemplate;
};

export type TemplatePillProps = {
  dragStateMoved: boolean;
  isLoading: boolean;
  onDeleteTemplate: (template: PromptTemplate) => void;
  onEditTemplate: (template: PromptTemplate) => void;
  onSelectTemplate: (template: PromptTemplate) => void;
  state: TemplateListState;
  template: PromptTemplate;
};
