import { useState } from 'react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale } from '../../platform/i18n';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import { GuideImageEditor, useGuideImageEditorMode } from './image-editor';
import { GuideDocument } from './guide-document';
import { GuideWorkspace } from './workspace';
import { GuideImageResources } from './resources';
import { GuideSavedHistory } from './saved-history';
import { GuideStepActions } from './step-actions';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { openGalleryPage } from '../../platform/navigation/extension-pages';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const imageEditor = useGuideImageEditorMode(state.images);
  const [focusRequest, setFocusRequest] = useState(0);
  const selectItem = (id: string) => {
    state.selectItem(id);
    setFocusRequest((current) => current + 1);
  };
  const { project, status } = state;
  const disabled = status === 'saving' || status === 'loading';
  const operate = (operation: GuideStructureOperation) => {
    const next = state.operate(operation);
    if (!next) return;
    const target =
      next.items.find((item) => !project?.items.some((current) => current.id === item.id)) ??
      next.items.find((item) => item.id === state.selectedId) ??
      next.items[0];
    if (target) {
      state.selectItem(target.id, next);
      setFocusRequest((current) => current + 1);
    } else state.selectItem(null, next);
  };
  if (imageEditor.selection && project)
    return (
      <GuideImageEditor
        project={project}
        {...imageEditor.selection}
        t={t}
        onApply={(input) => state.commitChange({ kind: 'edit', input })}
        onClose={imageEditor.close}
      />
    );
  return (
    <main
      className="guide-page"
      onBlurCapture={state.sealEdit}
      onKeyDownCapture={(event) => {
        if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z')
          return;
        if (
          event.target instanceof Element &&
          event.target.closest('[role="dialog"], [role="alertdialog"]')
        )
          return;
        event.preventDefault();
        if (event.shiftKey) state.redo();
        else state.undo();
      }}
    >
      <GuidePageHeader
        project={project}
        disabled={disabled}
        saveDisabled={disabled || status === 'saved' || status === 'conflict'}
        canUndo={state.canUndo}
        canRedo={state.canRedo}
        onUndo={state.undo}
        onRedo={state.redo}
        onSave={state.save}
        onChange={state.update}
        t={t}
      />
      <GuidePageFeedback status={status} actionError={state.actionError} t={t} />
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
          importResources={
            <GuideImageResources
              disabled={disabled || state.status === 'conflict'}
              selectedStepId={
                project.items.find((item) => item.id === state.selectedId)?.kind === 'step'
                  ? state.selectedId
                  : null
              }
              t={t}
              onImport={(input) => state.commitChange({ kind: 'import', input })}
            />
          }
          project={project}
          selectedId={state.selectedId}
          images={state.images}
          disabled={disabled}
          onSelect={selectItem}
          onAddStep={() => operate({ kind: 'add-step' })}
          onAddSection={() => operate({ kind: 'add-section' })}
          itemActions={
            <GuideStepActions
              project={project}
              selectedId={state.selectedId}
              disabled={disabled}
              onChange={state.update}
              onOperate={operate}
              t={t}
            />
          }
          projectActions={
            <GuideProjectActions
              project={project}
              disabled={disabled}
              status={status}
              onRestore={(revision) => state.commitChange({ kind: 'restore', revision })}
              onDuplicate={state.duplicate}
              onDelete={state.remove}
              onReload={state.reload}
              t={t}
            />
          }
          t={t}
        >
          <GuideDocument
            onEditImage={(itemId, blockId) => {
              state.sealEdit();
              imageEditor.open(itemId, blockId);
            }}
            focusRequest={focusRequest}
            project={project}
            selectedId={state.selectedId}
            images={state.images}
            disabled={disabled}
            onChange={state.update}
            onSelect={selectItem}
            onOperate={operate}
            t={t}
          />
        </GuideWorkspace>
      )}
    </main>
  );
}

function GuideProjectActions({
  project,
  disabled,
  status,
  onRestore,
  onDuplicate,
  onDelete,
  onReload,
  t,
}: {
  project: GuideProject;
  disabled: boolean;
  status: ReturnType<typeof useGuidePageState>['status'];
  onRestore: (revision: number) => Promise<boolean>;
  onDuplicate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  t: Translate;
}) {
  const [confirmation, setConfirmation] = useState<'delete' | 'reload' | null>(null);
  const hasUnsavedChanges = status === 'dirty' || status === 'failed' || status === 'conflict';
  const copy = () => {
    const pattern = t('scenario.editor.guideCopyName');
    const available = GUIDE_LIMITS.maxLabelLength - pattern.replace('{name}', '').length;
    void onDuplicate(pattern.replace('{name}', project.name.slice(0, available)));
  };
  const confirm = async () => {
    if (confirmation === 'delete') await onDelete();
    else if (confirmation === 'reload') await onReload();
    setConfirmation(null);
  };
  return (
    <div role="group" aria-label={t('scenario.editor.projectLabel')}>
      <GuideSavedHistory
        key={project.id}
        project={project}
        disabled={disabled || status === 'conflict'}
        onRestore={onRestore}
        t={t}
      />
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

function GuidePageHeader({
  project,
  disabled,
  saveDisabled,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onSave,
  onChange,
  t,
}: {
  project: GuideProject | null;
  disabled: boolean;
  saveDisabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => Promise<void>;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
}) {
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
  return (
    <>
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
              onChange={(event) =>
                onChange({ ...project, name: event.target.value }, 'project-name')
              }
            />
          </label>
        )}
        {project && (
          <div
            className="guide-history-controls"
            role="group"
            aria-label={t('scenario.editor.guideHistoryActions')}
          >
            <button
              type="button"
              disabled={disabled || !canUndo}
              onClick={onUndo}
              title={t('scenario.editor.guideUndoHint')}
            >
              {t('scenario.editor.guideUndo')}
            </button>
            <button
              type="button"
              disabled={disabled || !canRedo}
              onClick={onRedo}
              title={t('scenario.editor.guideRedoHint')}
            >
              {t('scenario.editor.guideRedo')}
            </button>
          </div>
        )}
        {project && (
          <button
            className="guide-save"
            type="button"
            disabled={saveDisabled}
            onClick={() => void onSave()}
          >
            {t('scenario.editor.guideSave')}
          </button>
        )}
      </header>
      {libraryStatus === 'failed' && (
        <div className="guide-page-feedback">
          <p role="alert">{t('scenario.editor.guideLibraryFailed')}</p>
        </div>
      )}
    </>
  );
}

function GuidePageFeedback({
  status,
  actionError,
  t,
}: {
  status: ReturnType<typeof useGuidePageState>['status'];
  actionError: ReturnType<typeof useGuidePageState>['actionError'];
  t: Translate;
}) {
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
  return (
    <div className="guide-page-feedback" data-status={status}>
      <p role="status" aria-live="polite">
        {statusMessages[status]}
      </p>
      {actionError && (
        <p role="alert">
          {t(
            actionError === 'copy'
              ? 'scenario.editor.guideCopyFailed'
              : actionError === 'restore'
                ? 'scenario.editor.guideHistoryRestoreFailed'
                : actionError === 'edit'
                  ? 'scenario.editor.guideImageApplyFailed'
                  : actionError === 'import'
                    ? 'scenario.editor.guideImportFailed'
                    : actionError === 'structure'
                      ? 'scenario.editor.guideOperationFailed'
                      : 'scenario.editor.guideDeleteFailed'
          )}
        </p>
      )}
    </div>
  );
}
