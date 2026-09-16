import { useState } from 'react';
import { FileText, Focus, Layers, ListChecks, ListFilter, Search, X } from 'lucide-react';
import { ProductInput } from '@sniptale/ui/product-form-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideProject, GuideStep } from '@sniptale/runtime-contracts/scenario/types/guide';
import { resolveGuideNumbering } from '../../features/scenario/project/public';
import type { Translate } from '../../platform/i18n';
import type { useGuideAiSession } from './use-ai-session';

type ScopeSession = Pick<
  ReturnType<typeof useGuideAiSession>,
  'mode' | 'chooseMode' | 'stepIds' | 'scope' | 'chooseStep' | 'chooseSteps' | 'pending'
>;

function stepExcerpt(step: GuideStep): string {
  return step.blocks
    .map((block) => {
      if (block.kind === 'heading') return block.text;
      if (block.kind === 'text' || block.kind === 'note')
        return block.paragraphs
          .map((paragraph) => paragraph.runs.map((run) => run.text).join(''))
          .join(' ');
      return block.caption || block.alt;
    })
    .filter(Boolean)
    .join(' ')
    .slice(0, 240);
}

/** Local scope navigation; filtering never mutates the session's explicit selection. */
export function GuideAiScopePicker({
  project,
  session,
  selectedStepId,
  selectedBlockId,
  t,
}: {
  project: GuideProject;
  session: ScopeSession;
  selectedStepId: string | null;
  selectedBlockId: string | null;
  t: Translate;
}) {
  const { mode, chooseMode, scope, pending } = session;
  const total = project.items.filter((item) => item.kind === 'step').length;
  return (
    <section className="guide-ai-scope" aria-label={t('scenario.editor.guideAiScope')}>
      <div className="guide-ai-scope-heading">
        <span>{t('scenario.editor.guideAiScope')}</span>
        <small aria-live="polite">
          {t('scenario.editor.guideAiSelectionCount')
            .replace('{selected}', String(scope.stepIds.length))
            .replace('{total}', String(total))}
        </small>
      </div>
      <div
        className="guide-ai-scope-actions"
        role="group"
        aria-label={t('scenario.editor.guideAiScope')}
      >
        {selectedBlockId && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={pending}
            aria-pressed={mode === 'block'}
            onClick={() => chooseMode('block')}
          >
            <Focus size={14} aria-hidden="true" />
            {t('scenario.editor.guideAiBlock')}
          </ProductActionButton>
        )}
        {selectedStepId && (
          <ProductActionButton
            compact
            tone="secondary"
            disabled={pending}
            aria-pressed={mode === 'step'}
            onClick={() => chooseMode('step')}
          >
            <FileText size={14} aria-hidden="true" />
            {t('scenario.editor.guideAiStep')}
          </ProductActionButton>
        )}
        <ProductActionButton
          compact
          tone="secondary"
          disabled={pending}
          aria-pressed={mode === 'all'}
          onClick={() => chooseMode('all')}
        >
          <Layers size={14} aria-hidden="true" />
          {t('scenario.editor.guideAiAllSteps')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={pending}
          aria-pressed={mode === 'steps'}
          onClick={() => chooseMode('steps')}
        >
          <ListChecks size={14} aria-hidden="true" />
          {t('scenario.editor.guideAiSteps')}
        </ProductActionButton>
      </div>
      {mode === 'steps' && <GuideAiStepSelection project={project} session={session} t={t} />}
      {mode === 'all' && (
        <p className="guide-ai-scope-summary">{t('scenario.editor.guideAiAllStepsHint')}</p>
      )}
    </section>
  );
}

function GuideAiStepSelection({
  project,
  session,
  t,
}: {
  project: GuideProject;
  session: ScopeSession;
  t: Translate;
}) {
  const [query, setQuery] = useState('');
  const [selectedOnly, setSelectedOnly] = useState(false);
  const { stepIds, chooseStep, chooseSteps, pending } = session;
  const selected = new Set(stepIds);
  const numbers = resolveGuideNumbering(project.items);
  const groups: Array<{ id: string; title: string; steps: GuideStep[] }> = [
    { id: project.id, title: '', steps: [] },
  ];
  for (const item of project.items) {
    if (item.kind === 'section')
      groups.push({
        id: item.id,
        title: item.title || t('scenario.editor.guideAddSection'),
        steps: [],
      });
    else groups[groups.length - 1]!.steps.push(item);
  }
  const needle = query.trim().toLocaleLowerCase();
  const visibleGroups = groups
    .map((group) => ({
      ...group,
      steps: group.steps.filter(
        (step) =>
          (!selectedOnly || selected.has(step.id)) &&
          `${group.title} ${step.title} ${stepExcerpt(step)}`.toLocaleLowerCase().includes(needle)
      ),
    }))
    .filter((group) => group.steps.length);
  const visibleIds = visibleGroups.flatMap((group) => group.steps.map((step) => step.id));
  return (
    <div className="guide-ai-step-selection">
      <div className="guide-ai-selection-tools">
        <div className="guide-ai-selection-search">
          <Search size={14} aria-hidden="true" />
          <ProductInput
            type="text"
            className="sniptale-input-compact"
            aria-label={t('scenario.editor.guideAiSearchSteps')}
            placeholder={t('scenario.editor.guideAiSearchSteps')}
            value={query}
            disabled={pending}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <ContentToolbarButton
              title={t('aiModal.clearSearchLabel')}
              disabled={pending}
              onClick={() => setQuery('')}
            >
              <X size={13} aria-hidden="true" />
            </ContentToolbarButton>
          )}
        </div>
        <ContentToolbarButton
          title={t(selectedOnly ? 'aiModal.showAllDataLabel' : 'aiModal.showSelectedOnlyLabel')}
          aria-pressed={selectedOnly}
          disabled={pending}
          onClick={() => setSelectedOnly((current) => !current)}
        >
          <ListFilter size={14} aria-hidden="true" />
        </ContentToolbarButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={pending || !visibleIds.some((id) => !selected.has(id))}
          onClick={() => chooseSteps(visibleIds, true)}
        >
          {t('scenario.editor.guideAiSelectVisible')}
        </ProductActionButton>
        <ProductActionButton
          compact
          tone="secondary"
          disabled={pending || !stepIds.length}
          onClick={() => chooseSteps(stepIds, false)}
        >
          {t('scenario.editor.guideAiClearSelection')}
        </ProductActionButton>
      </div>
      <div className="guide-ai-selection-list">
        {visibleGroups.map((group) => (
          <div className="guide-ai-selection-group" key={group.id}>
            {group.title && <div className="guide-ai-selection-section">{group.title}</div>}
            {group.steps.map((step) => (
              <label
                className="guide-ai-selection-row"
                data-selected={selected.has(step.id)}
                key={step.id}
              >
                <input
                  type="checkbox"
                  className="sniptale-checkbox"
                  checked={selected.has(step.id)}
                  disabled={pending}
                  aria-label={step.title || t('scenario.editor.guideStepTitle')}
                  onChange={(event) => chooseStep(step.id, event.target.checked)}
                />
                <span className="guide-ai-selection-number" aria-hidden="true">
                  {numbers.get(step.id)?.label ?? <FileText size={14} />}
                </span>
                <span className="guide-ai-selection-copy">
                  <strong>{step.title || t('scenario.editor.guideStepTitle')}</strong>
                  <small>{stepExcerpt(step) || t('scenario.editor.guideAiEmptyStep')}</small>
                </span>
              </label>
            ))}
          </div>
        ))}
        {!visibleIds.length && (
          <p role="status" className="guide-ai-selection-empty">
            {t('scenario.editor.guideAiNoMatchingSteps')}
          </p>
        )}
      </div>
    </div>
  );
}
