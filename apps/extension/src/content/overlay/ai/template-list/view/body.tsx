import { translate } from '../../../../../platform/i18n';
import { TemplateListActions } from './actions';
import { TemplatePill } from '../item';
import type { TemplateListProps } from '../types';
import type { useTemplateListState } from '../state';

type TemplateListBodyProps = Omit<TemplateListProps, 'onDeleteTemplate'> & {
  state: ReturnType<typeof useTemplateListState>;
};

export function TemplateListBody({
  isLoading,
  onAddTemplate,
  onEditTemplate,
  onSelectTemplate,
  state,
  templates,
}: TemplateListBodyProps) {
  return (
    <section className="sniptale-ai-template-section">
      <div className="sniptale-ai-template-section-header">
        <div>
          <div className="sniptale-ai-template-section-title">
            {translate('aiModal.templatesLabel')}
          </div>
          <div className="sniptale-ai-template-section-description">
            {translate('aiModal.templatesDescription')}
          </div>
        </div>
      </div>

      <div className={`sniptale-template-container ${state.draggedId ? 'dragging' : ''}`}>
        {templates.length === 0 ? (
          <div className="sniptale-template-empty">{translate('aiModal.templatesEmpty')}</div>
        ) : (
          state.visibleTemplates.map((template) => (
            <TemplatePill
              key={template.id}
              dragStateMoved={Boolean(state.dragStateRef.current?.moved)}
              isLoading={isLoading}
              onDeleteTemplate={state.handleDeleteTemplate}
              onEditTemplate={onEditTemplate}
              onSelectTemplate={onSelectTemplate}
              state={state}
              template={template}
            />
          ))
        )}

        <TemplateListActions
          hasMore={state.hasMore}
          isLoading={isLoading}
          onAddTemplate={onAddTemplate}
          orderedTemplatesCount={state.orderedTemplates.length}
          setShowAll={state.setShowAll}
          showAll={state.showAll}
        />
      </div>
    </section>
  );
}
