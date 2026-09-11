import { createTranslator, useAppLocale } from '../../platform/i18n';
import { createGuideParagraphs, createGuideStep } from '../../features/scenario/project/public';
import { GuideDocument } from './guide-document';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const { project, status } = state;
  const disabled = status === 'saving' || status === 'loading';
  const statusMessages = {
    saving: t('scenario.editor.guideSaving'),
    saved: t('scenario.editor.guideSaved'),
    dirty: t('scenario.editor.guideDirty'),
    failed: t('scenario.editor.guideFailed'),
    conflict: t('scenario.editor.guideConflict'),
    unavailable: t('scenario.editor.guideUnavailable'),
    missing: t('scenario.editor.guideMissing'),
    loading: t('scenario.editor.loading'),
    empty: '',
    ready: '',
  };
  const statusText = statusMessages[status];
  return (
    <main>
      <header>
        <h1>{t('scenario.editor.title')}</h1>
        <p role="status" aria-live="polite">
          {statusText}
        </p>
        {project && (
          <button
            type="button"
            disabled={disabled || status === 'saved' || status === 'conflict'}
            onClick={() => void state.save()}
          >
            {t('scenario.editor.guideSave')}
          </button>
        )}
      </header>
      {(status === 'missing' || status === 'unavailable') && (
        <button type="button" onClick={() => void state.reload()}>
          {t('scenario.editor.guideRetry')}
        </button>
      )}
      {!project && (status === 'empty' || status === 'failed') && (
        <section>
          <p>{t('scenario.editor.guideEmpty')}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void state.create(t('scenario.common.defaultProjectName'))}
          >
            {t('scenario.editor.createProject')}
          </button>
        </section>
      )}
      {project && (
        <>
          <label>
            {t('scenario.editor.projectLabel')}
            <input
              disabled={disabled}
              value={project.name}
              onChange={(event) => state.update({ ...project, name: event.target.value })}
            />
          </label>
          <nav aria-label={t('scenario.editor.outline')}>
            {project.items.map((item) => (
              <a
                key={item.id}
                href={`#${encodeURIComponent(item.id)}`}
                aria-current={state.selectedId === item.id ? 'step' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  state.selectItem(item.id);
                }}
              >
                {item.title || t('scenario.editor.untitledStep')}
              </a>
            ))}
          </nav>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              const step = createGuideStep();
              step.blocks.push({
                kind: 'text',
                id: crypto.randomUUID(),
                paragraphs: createGuideParagraphs(''),
              });
              state.update({ ...project, items: [...project.items, step] });
            }}
          >
            {t('scenario.editor.guideAddStep')}
          </button>
          <GuideDocument
            project={project}
            selectedId={state.selectedId}
            images={state.images}
            disabled={disabled}
            onChange={state.update}
            t={t}
          />
        </>
      )}
    </main>
  );
}
