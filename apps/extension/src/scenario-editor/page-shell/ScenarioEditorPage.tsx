import { useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale } from '../../platform/i18n';
import { createGuideParagraphs, createGuideStep } from '../../features/scenario/project/public';
import { GuideDocument } from './guide-document';
import { GuideWorkspace } from './workspace';
import { openGalleryPage } from '../../platform/navigation/extension-pages';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const [focusRequest, setFocusRequest] = useState(0);
  const selectItem = (id: string) => {
    state.selectItem(id);
    setFocusRequest((current) => current + 1);
  };
  const [libraryStatus, setLibraryStatus] = useState<'idle' | 'opening' | 'failed'>('idle');
  const openLibrary = async () => {
    if (libraryStatus === 'opening') return;
    setLibraryStatus('opening');
    try {
      await openGalleryPage();
      setLibraryStatus('idle');
    } catch {
      setLibraryStatus('failed');
    }
  };
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
    ready: t('scenario.editor.guideSaved'),
  };
  const statusText = statusMessages[status];
  return (
    <main className="guide-page">
      <header className="guide-page-header">
        <div className="guide-page-identity">
          <button
            type="button"
            className="guide-library-link"
            disabled={libraryStatus === 'opening'}
            onClick={() => void openLibrary()}
            title={t('scenario.editor.guideLibraryHint')}
          >
            {t('scenario.editor.guideLibrary')}
          </button>
          <h1>{t('scenario.editor.title')}</h1>
        </div>
        {project && (
          <label className="guide-project-name">
            <span>{t('scenario.editor.projectLabel')}</span>
            <input
              disabled={disabled}
              value={project.name}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              onChange={(event) => state.update({ ...project, name: event.target.value })}
            />
          </label>
        )}
        {project && (
          <button
            className="guide-save"
            type="button"
            disabled={disabled || status === 'saved' || status === 'conflict'}
            onClick={() => void state.save()}
          >
            {t('scenario.editor.guideSave')}
          </button>
        )}
      </header>
      <div className="guide-page-feedback" data-status={status}>
        {libraryStatus === 'failed' && (
          <p role="alert">{t('scenario.editor.guideLibraryFailed')}</p>
        )}
        <p role="status" aria-live="polite">
          {statusText}
        </p>
        {state.actionError && (
          <p role="alert">
            {t(
              state.actionError === 'copy'
                ? 'scenario.editor.guideCopyFailed'
                : 'scenario.editor.guideDeleteFailed'
            )}
          </p>
        )}
      </div>
      {(status === 'missing' || status === 'unavailable') && (
        <button type="button" onClick={() => void state.reload()}>
          {t('scenario.editor.guideRetry')}
        </button>
      )}
      {!project && (status === 'empty' || status === 'failed') && (
        <section className="guide-empty">
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
        <GuideWorkspace
          project={project}
          selectedId={state.selectedId}
          images={state.images}
          disabled={disabled}
          onSelect={selectItem}
          onAddStep={() => {
            const step = createGuideStep();
            step.blocks.push({
              kind: 'text',
              id: crypto.randomUUID(),
              paragraphs: createGuideParagraphs(''),
            });
            state.update({ ...project, items: [...project.items, step] });
          }}
          projectActions={
            <GuideProjectActions
              name={project.name}
              disabled={disabled}
              hasUnsavedChanges={status === 'dirty' || status === 'failed' || status === 'conflict'}
              onDuplicate={state.duplicate}
              onDelete={state.remove}
              onReload={state.reload}
              t={t}
            />
          }
          t={t}
        >
          <GuideDocument
            focusRequest={focusRequest}
            project={project}
            selectedId={state.selectedId}
            images={state.images}
            disabled={disabled}
            onChange={state.update}
            onSelect={selectItem}
            t={t}
          />
        </GuideWorkspace>
      )}
    </main>
  );
}

function GuideProjectActions({
  name,
  disabled,
  hasUnsavedChanges,
  onDuplicate,
  onDelete,
  onReload,
  t,
}: {
  name: string;
  disabled: boolean;
  hasUnsavedChanges: boolean;
  onDuplicate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  t: Translate;
}) {
  const [confirmation, setConfirmation] = useState<'delete' | 'reload' | null>(null);
  const copy = () => {
    const pattern = t('scenario.editor.guideCopyName');
    const available = GUIDE_LIMITS.maxLabelLength - pattern.replace('{name}', '').length;
    void onDuplicate(pattern.replace('{name}', name.slice(0, available)));
  };
  const confirm = async () => {
    if (confirmation === 'delete') await onDelete();
    else if (confirmation === 'reload') await onReload();
    setConfirmation(null);
  };
  return (
    <div role="group" aria-label={t('scenario.editor.projectLabel')}>
      <button type="button" disabled={disabled} onClick={copy}>
        {t('scenario.editor.guideDuplicate')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (hasUnsavedChanges) setConfirmation('reload');
          else void onReload();
        }}
      >
        {t('scenario.editor.guideReload')}
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setConfirmation('delete')}
        className="text-[var(--sniptale-color-danger)]"
      >
        {t('scenario.editor.guideDelete')}
      </button>
      <ProductConfirmDialog
        isOpen={confirmation !== null}
        isLoading={disabled}
        title={t(
          confirmation === 'delete' ? 'scenario.editor.guideDelete' : 'scenario.editor.guideReload'
        )}
        message={t(
          confirmation === 'delete'
            ? 'scenario.editor.guideDeleteMessage'
            : 'scenario.editor.guideReloadMessage'
        )}
        confirmText={t(
          confirmation === 'delete' ? 'common.actions.delete' : 'scenario.editor.guideReload'
        )}
        cancelText={t('common.actions.cancel')}
        onCancel={() => setConfirmation(null)}
        onConfirm={confirm}
      />
    </div>
  );
}
