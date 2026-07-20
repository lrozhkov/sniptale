import type React from 'react';
import type { PromptTemplate } from '../../../../../../contracts/settings';
import { translate } from '../../../../../../platform/i18n';
import { ProductTemplateMenuShell } from '@sniptale/ui/product-menus/dropdown';
import { TemplatePillButton } from './button';
import {
  createTemplateMenuToggleHandler,
  stopTemplateMenuEvent,
  updateTemplatePillRefs,
} from './wiring';
import type { TemplateListState } from '../types';

export function TemplatePillShell(props: {
  children: React.ReactNode;
  dragStateMoved: boolean;
  isLoading: boolean;
  isMenuOpen: boolean;
  onDeleteTemplate: (template: PromptTemplate) => void;
  onEditTemplate: (template: PromptTemplate) => void;
  onSelectTemplate: (template: PromptTemplate) => void;
  pillClasses: string;
  state: TemplateListState;
  template: PromptTemplate;
}) {
  return (
    <ProductTemplateMenuShell
      label={
        <TemplatePillButton
          dragStateMoved={props.dragStateMoved}
          isLoading={props.isLoading}
          onSelectTemplate={props.onSelectTemplate}
          template={props.template}
        />
      }
      menuLabel={translate('aiModal.templateActionsTitle')}
      menuDisabled={props.isLoading}
      open={props.isMenuOpen}
      onMenuClick={createTemplateMenuToggleHandler({
        isMenuOpen: props.isMenuOpen,
        setOpenMenuId: props.state.setOpenMenuId,
        templateId: props.template.id,
      })}
      onMenuMouseDown={stopTemplateMenuEvent}
      ref={(element) =>
        updateTemplatePillRefs({
          element,
          isMenuOpen: props.isMenuOpen,
          state: props.state,
          templateId: props.template.id,
        })
      }
      onMouseDown={(event) => props.state.handlePointerDown(event, props.template.id)}
      className={props.pillClasses}
    >
      {props.children}
    </ProductTemplateMenuShell>
  );
}
