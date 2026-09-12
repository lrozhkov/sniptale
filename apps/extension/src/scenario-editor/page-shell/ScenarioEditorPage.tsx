import type {
  GuideImageImportPlacement,
  GuideImageImportSource,
} from '../../composition/persistence/scenario/store/public';
import { GuideImageDropZone } from './image-drop';
import { GuideResourceDrawer, GuideResourceTrigger } from './resource-drawer';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideAppearance } from './appearance';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuidePageHeader } from './header';
import { GuideProjectActions } from './project-actions';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { GuideImageControls } from './image-controls';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale } from '../../platform/i18n';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import { GuideImageEditor, useGuideImageEditorMode } from './image-editor';
import { GuideDocument, type GuideFocusRequest } from './guide-document';
import { GuideWorkspace, GuidePanelControls } from './workspace';
import { useGuidePanels } from './panel-layout';
import { useGuidePageState } from './runtime/use-state';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const panels = useGuidePanels();
  const imageEditor = useGuideImageEditorMode(state.images);
  const { project, status } = state;
  const disabled = state.editingLocked;
  const importSources = (
    sources: GuideImageImportSource[],
    placement: GuideImageImportPlacement,
    signal: AbortSignal
  ) => state.commitChange({ kind: 'import', input: { sources, placement, signal } });
  const { focusRequest, selectItem, operate } = useGuideNavigation(state);
  const framing = useGuideImageFraming(state, panels, selectItem);
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
      onKeyDownCapture={(event) => handleGuideHistoryShortcut(event, state.undo, state.redo)}
    >
      {!project && header}
      <GuideProjectRecovery state={state} t={t} />
      {project && (
        <GuideResourceDrawer
          t={t}
          disabled={disabled || state.mutationPending || state.status === 'conflict'}
          selectedStepId={
            project.items.find((item) => item.id === state.selectedId)?.kind === 'step'
              ? state.selectedId
              : null
          }
          onImport={(input) => state.commitChange({ kind: 'import', input })}
        >
          <GuideWorkspace
            header={header}
            importResources={
              <GuideResourceTrigger t={t} disabled={disabled || state.mutationPending} />
            }
            images={state.images}
            panels={panels}
            project={project}
            selectedId={state.selectedId}
            disabled={disabled}
            onSelect={selectItem}
            onAddStep={() => operate({ kind: 'add-step' })}
            itemActions={
              <GuideContextualInspector
                project={project}
                selectedId={state.selectedId}
                framing={framing}
                images={state.images}
                disabled={disabled}
                onChange={state.update}
                t={t}
              />
            }
            t={t}
          >
            <GuideImageDropZone
              project={project}
              disabled={disabled || state.mutationPending || status === 'conflict'}
              onPlace={operate}
              onImport={importSources}
            >
              <GuideDocument
                framedImageId={framing.target?.block.id ?? null}
                onFrameImage={framing.select}
                onUploadImage={(stepId, blockId, file, signal) =>
                  importSources(
                    [{ kind: 'file', file }],
                    { kind: 'replace-image', stepId, blockId },
                    signal
                  )
                }
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
            </GuideImageDropZone>
          </GuideWorkspace>
        </GuideResourceDrawer>
      )}
    </main>
  );
}

/** Keeps document history shortcuts outside higher-priority modal interactions. */
function handleGuideHistoryShortcut(
  event: KeyboardEvent<HTMLElement>,
  undo: () => void,
  redo: () => void
) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'z') return;
  if (
    event.target instanceof Element &&
    event.target.closest('[role="dialog"], [role="alertdialog"]')
  )
    return;
  event.preventDefault();
  if (event.shiftKey) redo();
  else undo();
}

/** Routes the right inspector to current image framing or the selected step's appearance. */
function GuideContextualInspector({
  project,
  selectedId,
  framing,
  images,
  disabled,
  onChange,
  t,
}: {
  project: GuideProject;
  selectedId: string | null;
  framing: ReturnType<typeof useGuideImageFraming>;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: ReturnType<typeof useGuidePageState>['update'];
  t: Translate;
}) {
  return framing.target ? (
    <GuideImageControls
      block={framing.target.block}
      url={images[framing.target.block.assetId]}
      disabled={disabled}
      onChange={framing.change}
      onClose={framing.close}
      t={t}
    />
  ) : (
    <GuideAppearance
      project={project}
      selectedId={selectedId}
      disabled={disabled}
      onChange={onChange}
      t={t}
    />
  );
}

/** Owns one disposable framing selection; edits still use the page's canonical updater. */
function useGuideImageFraming(
  state: Pick<ReturnType<typeof useGuidePageState>, 'project' | 'selectedId' | 'update'>,
  panels: Pick<ReturnType<typeof useGuidePanels>, 'rightOpen' | 'toggleRight'>,
  selectItem: (id: string, requestFocus?: boolean) => void
) {
  const [selection, setSelection] = useState<{ itemId: string; blockId: string } | null>(null);
  const item = state.project?.items.find((entry) => entry.id === selection?.itemId);
  const block =
    item?.kind === 'step' ? item.blocks.find((entry) => entry.id === selection?.blockId) : null;
  const target =
    item?.kind === 'step' && block?.kind === 'image' && state.selectedId === item.id
      ? { item, block }
      : null;
  const targetValid = target !== null;
  useEffect(() => {
    if (selection && !targetValid) setSelection(null);
  }, [selection, targetValid]);
  const close = () => {
    setSelection(null);
    const element = [...document.querySelectorAll<HTMLElement>('[data-block-id]')].find(
      (entry) => entry.dataset['blockId'] === selection?.blockId
    );
    element?.querySelector<HTMLButtonElement>('[data-frame-image]')?.focus({ preventScroll: true });
  };
  return {
    target,
    close,
    select: (itemId: string, blockId: string, editing: boolean) => {
      if (!editing) {
        close();
        return;
      }
      selectItem(itemId, false);
      setSelection({ itemId, blockId });
      if (!panels.rightOpen) panels.toggleRight();
    },
    change: (next: NonNullable<typeof target>['block'], group?: string | null) => {
      if (!state.project || !target) return;
      state.update(
        {
          ...state.project,
          items: state.project.items.map((entry) =>
            entry.id === target.item.id
              ? {
                  ...target.item,
                  blocks: target.item.blocks.map((current) =>
                    current.id === next.id ? next : current
                  ),
                }
              : entry
          ),
        },
        group
      );
    },
  };
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
