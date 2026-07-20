import type { TemplateListProps } from '../types';
import type { useTemplateListState } from '../state';
import { TemplateListBody } from './body';
import { TemplateDeleteDialog } from './dialogs';
import { TemplateListLoadingState } from './loading';

export function TemplateListContent({
  isLoading,
  onAddTemplate,
  onDeleteTemplate,
  onEditTemplate,
  onSelectTemplate,
  state,
  templates,
}: TemplateListProps & { state: ReturnType<typeof useTemplateListState> }) {
  if (isLoading) {
    return <TemplateListLoadingState />;
  }

  return (
    <>
      <TemplateListBody
        isLoading={isLoading}
        onAddTemplate={onAddTemplate}
        onEditTemplate={onEditTemplate}
        onSelectTemplate={onSelectTemplate}
        state={state}
        templates={templates}
      />

      <TemplateDeleteDialog
        isLoading={isLoading}
        onDeleteTemplate={onDeleteTemplate}
        state={state}
      />
    </>
  );
}
