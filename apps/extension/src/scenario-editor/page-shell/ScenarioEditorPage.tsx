import { GuideResourceDrawer } from './resource-drawer';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideAppearance } from './appearance';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuidePageHeader } from './header';
import { GuideProjectActions } from './project-actions';
import { useState } from 'react';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale } from '../../platform/i18n';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import { GuideImageEditor, useGuideImageEditorMode } from './image-editor';
import { GuideDocument, type GuideFocusRequest } from './guide-document';
import { GuideWorkspace, GuidePanelControls } from './workspace';
import { useGuidePanels } from './panel-layout';
import { GuideImageResources } from './resources';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const panels = useGuidePanels();
  const imageEditor = useGuideImageEditorMode(state.images);
  const { project, status } = state;
  const disabled = state.editingLocked;
  const { focusRequest, selectItem, operate } = useGuideNavigation(state);
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
  const header = (
    <GuidePageHeader
      projectActions={
        project && (
          <GuideProjectActions
            project={project}
            disabled={disabled || state.mutationPending}
            status={status}
            onDuplicate={state.duplicate}
            onDelete={state.remove}
            onReload={state.reload}
            t={t}
          />
        )
      }
      leftControls={project && <GuidePanelControls panels={panels} t={t} side="left" />}
      panelControls={project && <GuidePanelControls panels={panels} t={t} side="right" />}

      project={project}
      disabled={disabled}
      feedback={
        <GuidePageFeedback
          status={status}
          actionError={state.actionError}
          onRetry={project ? state.save : undefined}
          t={t}
        />
      }
      canUndo={state.canUndo}
      canRedo={state.canRedo}
      onUndo={state.undo}
      onRedo={state.redo}
      onChange={state.update}
      t={t}
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
      {!project && header}
      <GuideProjectRecovery state={state} t={t} />
      {project && (
        <GuideWorkspace
          header={header}
          importResources={
            <GuideResourceDrawer t={t}>
              <GuideImageResources
                disabled={disabled || state.mutationPending || state.status === 'conflict'}
                selectedStepId={
                  project.items.find((item) => item.id === state.selectedId)?.kind === 'step'
                    ? state.selectedId
                    : null
                }
                t={t}
                onImport={(input) => state.commitChange({ kind: 'import', input })}
              />
            </GuideResourceDrawer>
          }
          images={state.images}
          panels={panels}
          project={project}
          selectedId={state.selectedId}
          disabled={disabled}
          onSelect={selectItem}
          onAddStep={() => operate({ kind: 'add-step' })}
          onAddSection={() => operate({ kind: 'add-section' })}
          itemActions={
            <GuideAppearance
              project={project}
              selectedId={state.selectedId}
              disabled={disabled}
              onChange={state.update}
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
            onSelect={(id) => selectItem(id, false)}
            onOperate={operate}
            t={t}
          />
        </GuideWorkspace>
      )}
    </main>
  );
}

/** Selection and structural commands share one disposable document focus intent. */
function useGuideNavigation(
  state: Pick<
    ReturnType<typeof useGuidePageState>,
    'project' | 'selectedId' | 'selectItem' | 'operate'
  >
) {
  const [focusRequest, setFocusRequest] = useState<GuideFocusRequest>({ sequence: 0 });
  const selectItem = (id: string, requestFocus = true) => {
    state.selectItem(id);
    setFocusRequest((current) => ({
      sequence: current.sequence + 1,
      preserveFocus: !requestFocus,
    }));
  };
  const { project } = state;
  const operate = (operation: GuideStructureOperation) => {
    const next = state.operate(operation);
    if (!next) return;
    const { target, addedItem, addedBlock } = resolveOperationFocus(
      project,
      next,
      state.selectedId
    );
    if (target) {
      state.selectItem(target.id, next);
      setFocusRequest((current) => ({
        sequence: current.sequence + 1,
        ...(addedItem ? { field: true } : addedBlock ? { blockId: addedBlock.id } : {}),
      }));
    } else state.selectItem(null, next);
  };
  return { focusRequest, selectItem, operate };
}

/** Maps canonical structural changes to a document focus destination without owning edit state. */
function resolveOperationFocus(
  project: GuideProject | null,
  next: GuideProject,
  selectedId: string | null
) {
  const addedItem = next.items.find(
    (item) => !project?.items.some((current) => current.id === item.id)
  );
  const previousBlockIds = new Set(
    project?.items.flatMap((item) =>
      item.kind === 'step' ? item.blocks.map((block) => block.id) : []
    )
  );
  const addedBlockItem = next.items.find(
    (item) => item.kind === 'step' && item.blocks.some((block) => !previousBlockIds.has(block.id))
  );
  const addedBlock =
    addedBlockItem?.kind === 'step'
      ? addedBlockItem.blocks.find((block) => !previousBlockIds.has(block.id))
      : undefined;
  const target =
    addedItem ??
    addedBlockItem ??
    next.items.find((item) => item.id === selectedId) ??
    next.items[0];
  return { target, addedItem, addedBlock };
}

function GuidePageFeedback({
  status,
  onRetry,
  actionError,
  t,
}: {
  status: ReturnType<typeof useGuidePageState>['status'];
  onRetry: (() => Promise<boolean>) | undefined;
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
    <div
      className="guide-page-feedback"
      data-status={status}
      data-quiet={
        !actionError &&
        (status === 'saving' ||
          status === 'saved' ||
          status === 'ready' ||
          status === 'dirty' ||
          status === 'empty')
      }
    >
      <p role="status" aria-live="polite">
        {statusMessages[status]}
      </p>
      {status === 'failed' && onRetry && (
        <ProductActionButton tone="secondary" compact type="button" onClick={() => void onRetry()}>
          {t('common.actions.retry')}
        </ProductActionButton>
      )}
      {actionError && (
        <p role="alert">
          {t(
            actionError === 'copy'
              ? 'scenario.editor.guideCopyFailed'
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
