import { getTemplatePillClasses } from './helpers';
import { renderTemplateMenu } from './menu';
import { TemplatePillShell } from './shell';
import type { TemplatePillProps } from './types';

export function TemplatePill({
  dragStateMoved,
  isLoading,
  onDeleteTemplate,
  onEditTemplate,
  onSelectTemplate,
  state,
  template,
}: TemplatePillProps) {
  const isMenuOpen = state.openMenuId === template.id;
  const isDragging = state.draggedId === template.id;
  const isDragOver = state.dragOverId === template.id;
  const pillClasses = getTemplatePillClasses({
    isDragOver,
    isDragging,
    isLoading,
    isMenuOpen,
  });

  return (
    <TemplatePillShell
      dragStateMoved={dragStateMoved}
      isLoading={isLoading}
      isMenuOpen={isMenuOpen}
      onDeleteTemplate={onDeleteTemplate}
      onEditTemplate={onEditTemplate}
      onSelectTemplate={onSelectTemplate}
      pillClasses={pillClasses}
      state={state}
      template={template}
    >
      {isMenuOpen
        ? renderTemplateMenu({ isLoading, onDeleteTemplate, onEditTemplate, state, template })
        : null}
    </TemplatePillShell>
  );
}
