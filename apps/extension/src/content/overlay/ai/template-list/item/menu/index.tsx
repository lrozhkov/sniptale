import type { PromptTemplate } from '../../../../../../contracts/settings';
import { TemplateMenuActionItems } from './actions';
import type { TemplateListState } from '../types';

function closeMenuAndEditTemplate(props: {
  onEditTemplate: (template: PromptTemplate) => void;
  selectedTemplate: PromptTemplate;
  state: TemplateListState;
}) {
  props.state.setOpenMenuId(null);
  props.onEditTemplate(props.selectedTemplate);
}

export function renderTemplateMenu(props: {
  isLoading: boolean;
  onDeleteTemplate: (template: PromptTemplate) => void;
  onEditTemplate: (template: PromptTemplate) => void;
  state: TemplateListState;
  template: PromptTemplate;
}) {
  return (
    <TemplateMenuActionItems
      isLoading={props.isLoading}
      onDelete={props.onDeleteTemplate}
      onEdit={(selectedTemplate) =>
        closeMenuAndEditTemplate({
          onEditTemplate: props.onEditTemplate,
          selectedTemplate,
          state: props.state,
        })
      }
      template={props.template}
    />
  );
}
