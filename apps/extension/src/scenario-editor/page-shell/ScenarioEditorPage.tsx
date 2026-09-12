import type {
  GuideImageImportPlacement,
  GuideImageImportSource,
  GuideTemplateApplication,
} from '../../composition/persistence/scenario/store/public';
import { GuideImageDropZone } from './image-drop';
import { GuideResourceDrawer } from './resource-drawer';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { GuideBlockInspector } from './block-inspector';
import { GuideReader, useGuideReaderMode } from './reader';
import { GuideAppearance } from './appearance';
import { GuideDefaultAppearance } from './default-appearance';
import { applyGuideDefaultStyle } from '../../features/scenario/project/public';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { GuidePageHeader } from './header';
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
  const { project, status, editingLocked: disabled } = state;
  const reader = useGuideReaderMode(state.sealEdit);
  const commandsDisabled = disabled || state.mutationPending;
  const importDisabled = commandsDisabled || status === 'conflict';
  const imports = guideImageImportCommands(state.commitChange);
  const { focusRequest, selectItem, selectedStepId, operate } = useGuideNavigation(state);
  const framing = useGuideBlockSelection(state, panels, selectItem);
  const feedback = (
    <GuidePageFeedback
      status={status}
      actionError={state.actionError}
      onRetry={project ? state.save : undefined}
      t={t}
    />
  );
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
  if (reader.active && project)
    return (
      <GuideReader
        project={project}
        images={state.images}
        initialId={state.selectedId}
        onChange={state.update}
        feedback={
          status === 'failed' || status === 'conflict' || state.actionError ? feedback : null
        }
        t={t}
        onClose={reader.close}
      />
    );
  const header = (
    <GuidePageHeader
      images={state.images}
      aiSelection={{ stepId: selectedStepId, blockId: framing.target?.block.id ?? null }}
      onAiOpen={state.sealEdit}
      onAppearance={() => panels.openRight('document')}
      onPreview={reader.open}
      previewRef={reader.trigger}
      previewDisabled={disabled}
      status={status}
      commandsDisabled={commandsDisabled}
      onDuplicate={state.duplicate}
      onDelete={state.remove}
      onReload={state.reload}
      leftControls={project && <GuidePanelControls panels={panels} t={t} side="left" />}
      panelControls={project && <GuidePanelControls panels={panels} t={t} side="right" />}
      project={project}
      disabled={disabled}
      feedback={feedback}
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
          disabled={importDisabled}
          selectedStepId={selectedStepId}
          onImport={imports.resources}
        >
          <GuideImageDropZone
            t={t}
            project={project}
            disabled={importDisabled}
            onPlace={operate}
            onImport={imports.drop}
          >
            <GuideWorkspace
              onUploadFile={imports.uploadStep}
              header={header}
              images={state.images}
              panels={panels}
              project={project}
              selectedId={state.selectedId}
              disabled={disabled}
              onSelect={framing.selectStep}
              onAddStep={() => operate({ kind: 'add-step' })}
              inspectedBlockKind={framing.target?.block.kind}
              itemActions={
                <GuideContextualInspector
                  onSaveTemplate={state.saveTemplate}
                  onApplyTemplate={(stepId, templateId, mode) =>
                    state.commitChange({ kind: 'template', input: { stepId, templateId, mode } })
                  }
                  presentation={panels.presentation}
                  scope={panels.rightScope}
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
              <GuideDocument
                framedImageId={framing.imageId}
                onSelectBlock={framing.selectBlock}
                onFrameImage={framing.select}
                onUploadImage={imports.upload}
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
          </GuideImageDropZone>
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
  onSaveTemplate,
  onApplyTemplate,
  scope,
  presentation,
  project,
  selectedId,
  framing,
  images,
  disabled,
  onChange,
  t,
}: {
  presentation: 'all' | 'sections';
  project: GuideProject;
  selectedId: string | null;
  scope: 'selection' | 'document';
  onSaveTemplate: (stepId: string, name: string) => Promise<boolean>;
  onApplyTemplate: (
    stepId: string,
    templateId: string,
    mode: GuideTemplateApplication
  ) => Promise<boolean>;
  framing: ReturnType<typeof useGuideBlockSelection>;
  images: Record<string, string | null>;
  disabled: boolean;
  onChange: ReturnType<typeof useGuidePageState>['update'];
  t: Translate;
}) {
  if (scope === 'document')
    return (
      <GuideDefaultAppearance
        style={project.style}
        disabled={disabled}
        t={t}
        onApply={(style, resetSteps) =>
          onChange(applyGuideDefaultStyle(project, style, resetSteps))
        }
      />
    );
  if (!selectedId)
    return <p className="guide-inspector-hint">{t('scenario.editor.guideSelectForSettings')}</p>;
  return framing.target?.block.kind === 'image' ? (
    <GuideImageControls
      block={framing.target.block}
      htmlDefaults={project.htmlExport}
      url={images[framing.target.block.assetId]}
      disabled={disabled}
      onChange={framing.change}
      onClose={framing.close}
      t={t}
    />
  ) : framing.target ? (
    <GuideBlockInspector
      item={framing.target.item}
      block={framing.target.block}
      disabled={disabled}
      onChange={framing.change}
      onClose={framing.close}
      t={t}
    />
  ) : (
    <GuideAppearance
      presentation={presentation}
      onSaveTemplate={onSaveTemplate}
      onApplyTemplate={onApplyTemplate}
      project={project}
      selectedId={selectedId}
      disabled={disabled}
      onChange={onChange}
      t={t}
    />
  );
}

/** Owns one disposable block selection; edits still use the page's canonical updater. */
function useGuideBlockSelection(
  state: Pick<ReturnType<typeof useGuidePageState>, 'project' | 'selectedId' | 'update'>,
  panels: Pick<ReturnType<typeof useGuidePanels>, 'rightOpen' | 'toggleRight' | 'selectRightScope'>,
  selectItem: (id: string, requestFocus?: boolean) => void
) {
  const [selection, setSelection] = useState<{ itemId: string; blockId: string } | null>(null);
  const item = state.project?.items.find((entry) => entry.id === selection?.itemId);
  const block =
    item?.kind === 'step' ? item.blocks.find((entry) => entry.id === selection?.blockId) : null;
  const target =
    item?.kind === 'step' && block && state.selectedId === item.id ? { item, block } : null;
  const targetValid = target !== null;
  useEffect(() => {
    if (selection && !targetValid) setSelection(null);
  }, [selection, targetValid]);
  const close = () => {
    setSelection(null);
    const element = [...document.querySelectorAll<HTMLElement>('[data-block-id]')].find(
      (entry) => entry.dataset['blockId'] === selection?.blockId
    );
    const trigger =
      target?.block.kind === 'image'
        ? element?.querySelector<HTMLElement>('[data-frame-image]')
        : element?.closest('article')?.querySelector<HTMLElement>('.guide-step-title');
    trigger?.focus({ preventScroll: true });
  };
  return {
    target,
    imageId: target?.block.kind === 'image' ? target.block.id : null,
    close,
    selectStep: (itemId: string) => {
      panels.selectRightScope('selection');
      setSelection(null);
      selectItem(itemId);
    },
    selectBlock: (itemId: string, blockId: string | null) => {
      panels.selectRightScope('selection');
      selectItem(itemId, false);
      setSelection(blockId ? { itemId, blockId } : null);
      if (blockId && !panels.rightOpen && window.innerWidth >= 1200) panels.toggleRight();
    },
    select: (itemId: string, blockId: string, editing: boolean) => {
      if (!editing) {
        close();
        return;
      }
      panels.selectRightScope('selection');
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
      operation.kind === 'transfer-block' ? operation.targetItemId : state.selectedId
    );
    if (target) {
      state.selectItem(target.id, next);
      setFocusRequest((current) => ({
        sequence: current.sequence + 1,
        ...(operation.kind === 'transfer-block'
          ? { preserveFocus: true }
          : addedItem
            ? { field: true }
            : addedBlock
              ? { blockId: addedBlock.id }
              : {}),
      }));
    } else state.selectItem(null, next);
  };
  const selected = project?.items.find((item) => item.id === state.selectedId);
  const selectedStepId = selected?.kind === 'step' ? selected.id : null;
  return { focusRequest, selectItem, selectedStepId, operate };
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
            actionError === 'template'
              ? 'scenario.editor.templateFailed'
              : actionError === 'copy'
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

/** Adapts library, drop and upload gestures to the existing single import transaction. */
function guideImageImportCommands(commit: ReturnType<typeof useGuidePageState>['commitChange']) {
  const resources = (input: Extract<Parameters<typeof commit>[0], { kind: 'import' }>['input']) =>
    commit({ kind: 'import', input });
  return {
    resources,
    uploadStep: (file: File, signal: AbortSignal) =>
      resources({ sources: [{ kind: 'file', file }], placement: { kind: 'steps' }, signal }),
    drop: (
      sources: GuideImageImportSource[],
      placement: GuideImageImportPlacement,
      signal: AbortSignal
    ) => resources({ sources, placement, signal }),
    upload: (stepId: string, blockId: string | null, file: File, signal: AbortSignal) =>
      resources({
        sources: [{ kind: 'file', file }],
        placement:
          blockId === null
            ? { kind: 'blocks', stepId }
            : { kind: 'replace-image', stepId, blockId },
        signal,
      }),
  };
}
