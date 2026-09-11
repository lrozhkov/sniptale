import { GuideAppearance } from './appearance';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuidePageHeader } from './header';
import { GuideProjectActions } from './project-actions';
import { useState } from 'react';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale } from '../../platform/i18n';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import { GuideImageEditor, useGuideImageEditorMode } from './image-editor';
import { GuideDocument } from './guide-document';
import { GuideWorkspace, GuidePanelControls } from './workspace';
import { useGuidePanels } from './panel-layout';
import { GuideImageResources } from './resources';
import { GuideStepActions } from './step-actions';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const panels = useGuidePanels();
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
        panelControls={project && <GuidePanelControls panels={panels} t={t} />}
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
      <GuideProjectRecovery state={state} t={t} />
      {project && (
        <GuideWorkspace
          panels={panels}
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
            <>
              <GuideAppearance
                project={project}
                selectedId={state.selectedId}
                disabled={disabled}
                onChange={state.update}
                t={t}
              />
              <GuideStepActions
                project={project}
                selectedId={state.selectedId}
                disabled={disabled}
                onChange={state.update}
                onOperate={operate}
                t={t}
              />
            </>
          }
          projectActions={
            <GuideProjectActions
              project={project}
              disabled={disabled}
              status={status}
              onRestore={(revision) => state.commitChange({ kind: 'restore', revision })}
              onClearHistory={() => state.commitChange({ kind: 'clearHistory' })}
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
              : actionError === 'clearHistory'
                ? 'scenario.editor.guideHistoryClearFailed'
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

/** Empty and unavailable project recovery actions share the page state owner. */
function GuideProjectRecovery({
  state,
  t,
}: {
  state: ReturnType<typeof useGuidePageState>;
  t: Translate;
}) {
  const { project, status } = state;
  const disabled = status === 'loading' || status === 'saving';
  return (
    <>
      {' '}
      {(status === 'missing' || status === 'unavailable') && (
        <ProductActionButton
          tone="secondary"
          compact
          type="button"
          onClick={() => void state.reload()}
        >
          {t('scenario.editor.guideRetry')}
        </ProductActionButton>
      )}
      {!project && (status === 'empty' || status === 'failed') && (
        <section className="guide-empty">
          <p>{t('scenario.editor.guideEmpty')}</p>
          <ProductActionButton
            tone="secondary"
            compact
            type="button"
            disabled={disabled}
            onClick={() => void state.create(t('scenario.common.defaultProjectName'))}
          >
            {t('scenario.editor.createProject')}
          </ProductActionButton>
        </section>
      )}
    </>
  );
}
