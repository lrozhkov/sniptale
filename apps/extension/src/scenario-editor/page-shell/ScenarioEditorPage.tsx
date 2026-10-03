import { TourHtmlExport } from './tour/export';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { BookOpen, MousePointerClick } from 'lucide-react';
import { TourWorkspace } from './tour/workspace';
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
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { GuideImageControls } from './image-controls';
import type { Translate } from '../../platform/i18n';
import { createTranslator, useAppLocale, usePageLocaleMetadata } from '../../platform/i18n';
import type { GuideStructureOperation } from '../../features/scenario/project/public';
import { GuideImageEditor, TourImageEditor, useGuideImageEditorMode } from './image-editor';
import { GuideDocument, type GuideFocusRequest } from './guide-document';
import { GuideWorkspace, GuidePanelControls } from './workspace';
import { useGuidePanels } from './panel-layout';
import { useGuidePageState } from './runtime/use-state';
import { ScenarioEditorStart } from './start';

/** Composes the local guide workspace around its single edit/save state owner. */
export function ScenarioEditorPage() {
  const t = createTranslator(useAppLocale());
  const state = useGuidePageState();
  const panels = useGuidePanels();
  const [representation, setRepresentation] = useState<'guide' | 'tour'>('guide');
  const imageEditor = useGuideImageEditorMode(state.images);
  const { project, status, editingLocked: disabled } = state;
  const reader = useGuideReaderMode(state.sealEdit);
  usePageLocaleMetadata(
    'scenario.editor.documentTitle',
    project?.name,
    reader.active ? 'scenario.editor.previewTitle' : undefined
  );
  const commandsDisabled = disabled || state.mutationPending;
  const importDisabled = commandsDisabled || status === 'conflict';
  const imports = guideImageImportCommands(state.commitChange);
  const tourMode = representation === 'tour' && project?.purpose !== 'step-template';
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
  if (imageEditor.tourSlideId && project)
    return (
      <TourImageEditor
        project={project}
        slideId={imageEditor.tourSlideId}
        t={t}
        onApply={(input) => state.commitChange({ kind: 'tour-edit', input })}
        onClose={imageEditor.closeTour}
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
  if (reader.active && project && tourMode)
    return <TourHtmlExport project={project} t={t} onClose={reader.close} />;
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
  const renderHeader = (contextControls?: ReactNode) => (
    <ScenarioHeader
      state={state}
      panels={panels}
      reader={reader}
      framing={framing}
      selectedStepId={selectedStepId}
      tourMode={tourMode}
      representation={representation}
      onRepresentation={setRepresentation}
      contextControls={contextControls}
      feedback={feedback}
      t={t}
    />
  );
  if (!project) return <ScenarioEditorStart state={state} t={t} />;
  return (
    <main
      className="guide-page"
      onBlurCapture={(event) => {
        state.sealEdit();
        const field = event.target;
        if (
          !(field instanceof HTMLTextAreaElement) &&
          !(field instanceof HTMLInputElement && ['text', 'number', 'search'].includes(field.type))
        )
          return;
        // Commands that acquire the mutation gate consume the draft themselves.
        if (
          event.relatedTarget instanceof Element &&
          event.relatedTarget.closest('button,[role="button"]')
        )
          return;
        state.flushEdits();
      }}
      onKeyDownCapture={(event) => handleGuideHistoryShortcut(event, state.undo, state.redo)}
    >
      {tourMode && (
        <TourWorkspace
          key={project.id}
          project={project}
          images={state.images}
          panels={panels}
          header={renderHeader}
          disabled={disabled || status === 'conflict'}
          importDisabled={importDisabled}
          onChange={state.update}
          onImport={imports.resources}
          onImportNarration={(input) => state.commitChange({ kind: 'narration', input })}
          initialSlideId={imageEditor.returnSlideId}
          onEditImage={(slideId) => {
            state.sealEdit();
            imageEditor.openTour(slideId);
          }}
          t={t}
        />
      )}
      {!tourMode && (
        <GuideDocumentWorkspace
          state={state}
          project={project}
          panels={panels}
          header={renderHeader()}
          imports={imports}
          importDisabled={importDisabled}
          disabled={disabled}
          selectedStepId={selectedStepId}
          framing={framing}
          operate={operate}
          imageEditor={imageEditor}
          focusRequest={focusRequest}
          t={t}
        />
      )}
    </main>
  );
}

/** Keeps reference-guide composition independent from the tour representation. */
function GuideDocumentWorkspace({
  state,
  project,
  panels,
  header,
  imports,
  importDisabled,
  disabled,
  selectedStepId,
  framing,
  operate,
  imageEditor,
  focusRequest,
  t,
}: {
  state: ReturnType<typeof useGuidePageState>;
  project: GuideProject;
  panels: ReturnType<typeof useGuidePanels>;
  header: ReactNode;
  imports: ReturnType<typeof guideImageImportCommands>;
  importDisabled: boolean;
  disabled: boolean;
  selectedStepId: string | null;
  framing: ReturnType<typeof useGuideBlockSelection>;
  operate: ReturnType<typeof useGuideNavigation>['operate'];
  imageEditor: ReturnType<typeof useGuideImageEditorMode>;
  focusRequest: ReturnType<typeof useGuideNavigation>['focusRequest'];
  t: Translate;
}) {
  return (
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
          onClearSelection={framing.clear}
          onSelect={framing.selectStep}
          onOperate={operate}
          onAddStep={() => operate({ kind: 'add-step' })}
          inspectedBlockKind={framing.target?.block.kind}
          itemActions={
            <GuideContextualInspector
              onEditImage={(itemId, blockId) => {
                state.sealEdit();
                imageEditor.open(itemId, blockId);
              }}
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
            selectedBlockId={framing.target?.block.id ?? null}
            onClearSelection={framing.clear}
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
            onOperate={operate}
            t={t}
          />
        </GuideWorkspace>
      </GuideImageDropZone>
    </GuideResourceDrawer>
  );
}

/** Binds header actions to the active representation and the shared project session. */
function ScenarioHeader({
  state,
  panels,
  reader,
  framing,
  selectedStepId,
  tourMode,
  representation,
  onRepresentation,
  contextControls,
  feedback,
  t,
}: {
  state: ReturnType<typeof useGuidePageState>;
  panels: ReturnType<typeof useGuidePanels>;
  reader: ReturnType<typeof useGuideReaderMode>;
  framing: ReturnType<typeof useGuideBlockSelection>;
  selectedStepId: string | null;
  tourMode: boolean;
  representation: 'guide' | 'tour';
  onRepresentation: (value: 'guide' | 'tour') => void;
  contextControls?: ReactNode;
  feedback: ReactNode;
  t: Translate;
}) {
  const { project, status, editingLocked: disabled } = state;
  const commandsDisabled = disabled || state.mutationPending;
  return (
    <GuidePageHeader
      autosaveEnabled={state.autosaveEnabled}
      onAutosaveChange={state.setAutosaveEnabled}
      images={state.images}
      {...(!tourMode
        ? {
            aiSelection: { stepId: selectedStepId, blockId: framing.target?.block.id ?? null },
            onAiOpen: state.sealEdit,
            prepareAiProject: state.flushLatest,
          }
        : {})}
      onAppearance={() => {
        if (!tourMode) framing.clear();
        panels.openRight('document');
      }}
      appearanceActive={panels.rightOpen && panels.rightScope === 'document'}
      onPreview={reader.open}
      previewRef={reader.trigger}
      previewDisabled={disabled || (tourMode && !project?.tour?.slides.length)}
      showSnap={!tourMode}
      representationControls={
        project &&
        project.purpose !== 'step-template' && (
          <div
            className="tour-representation-switch"
            role="group"
            aria-label={t('scenario.editor.representation')}
          >
            {(
              [
                { value: 'guide', Icon: BookOpen, label: t('scenario.editor.referenceMode') },
                { value: 'tour', Icon: MousePointerClick, label: t('scenario.editor.tourMode') },
              ] as const
            ).map(({ value, Icon, label }) => (
              <ContentToolbarButton
                key={value}
                className="guide-section-tab"
                title={label}
                aria-label={label}
                aria-pressed={representation === value}
                onClick={() => {
                  if (representation === value) return;
                  state.sealEdit();
                  onRepresentation(value);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                {representation === value && <span>{label}</span>}
              </ContentToolbarButton>
            ))}
          </div>
        )
      }
      status={status}
      commandsDisabled={commandsDisabled}
      contextControls={contextControls}
      onDuplicate={state.duplicate}
      onDelete={state.remove}
      onReload={state.reload}
      leftControls={
        project && (
          <GuidePanelControls panels={panels} t={t} side="left" representation={representation} />
        )
      }
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
  onEditImage,
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
  onEditImage: (itemId: string, blockId: string) => void;
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
      stepId={framing.target.item.id}
      onEdit={() => {
        if (framing.target) onEditImage(framing.target.item.id, framing.target.block.id);
      }}
      block={framing.target.block}
      htmlDefaults={project.htmlExport}
      url={images[framing.target.block.assetId]}
      disabled={disabled}
      onChange={framing.change}
      onClose={framing.close}
      onEscape={framing.imageId ? framing.finishFraming : framing.close}
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
  selectItem: (id: string | null, requestFocus?: boolean) => void
) {
  const [selection, setSelection] = useState<{ itemId: string; blockId: string } | null>(null);
  const [framedId, setFramedId] = useState<string | null>(null);
  const item = state.project?.items.find(
    (entry) =>
      entry.kind === 'step' && entry.blocks.some((block) => block.id === selection?.blockId)
  );
  const block =
    item?.kind === 'step' ? item.blocks.find((entry) => entry.id === selection?.blockId) : null;
  const target =
    item?.kind === 'step' && block && state.selectedId === item.id ? { item, block } : null;
  const targetValid = target !== null;
  useEffect(() => {
    if (selection && item && item.id !== selection.itemId) {
      setSelection({ itemId: item.id, blockId: selection.blockId });
      selectItem(item.id, false);
      const moved = [...document.querySelectorAll<HTMLElement>('.guide-block[data-block-id]')].find(
        (element) => element.dataset['blockId'] === selection.blockId
      );
      moved?.focus({ preventScroll: true });
    }
  }, [item, selection, selectItem]);
  useEffect(() => {
    if (selection && !targetValid && (!item || item.id === selection.itemId)) {
      setSelection(null);
      setFramedId(null);
    }
  }, [selection, targetValid, item]);
  const close = () => {
    setSelection(null);
    setFramedId(null);
    const parent = document.getElementById(state.selectedId ?? '');
    parent?.focus({ preventScroll: true });
  };
  const finishFraming = () => {
    setFramedId(null);
  };
  const clear = () => {
    setSelection(null);
    setFramedId(null);
    selectItem(null, false);
    panels.selectRightScope('document');
  };
  return {
    target,
    imageId: target?.block.kind === 'image' && framedId === target.block.id ? framedId : null,
    clear,
    finishFraming,
    close,
    selectStep: (itemId: string) => {
      panels.selectRightScope('selection');
      setSelection(null);
      setFramedId(null);
      selectItem(itemId);
    },
    selectBlock: (itemId: string, blockId: string | null) => {
      panels.selectRightScope('selection');
      selectItem(itemId, false);
      if (blockId !== selection?.blockId) setFramedId(null);
      setSelection(blockId ? { itemId, blockId } : null);
      if (blockId && !panels.rightOpen && window.innerWidth >= 1200) panels.toggleRight();
    },
    select: (itemId: string, blockId: string, editing: boolean) => {
      if (!editing) {
        finishFraming();
        return;
      }
      panels.selectRightScope('selection');
      selectItem(itemId, false);
      setSelection({ itemId, blockId });
      setFramedId(blockId);
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
  const selectItem = (id: string | null, requestFocus = true) => {
    state.selectItem(id);
    setFocusRequest((current) => ({
      sequence: current.sequence + 1,
      preserveFocus: !requestFocus,
    }));
  };
  const { project } = state;
  const operate = (operation: GuideStructureOperation) => {
    const selected = project?.items.find((item) => item.id === state.selectedId);
    const requested =
      operation.kind === 'add-step' && selected?.kind === 'step'
        ? { ...operation, layout: operation.layout ?? selected.layout }
        : operation;
    const next = state.operate(requested);
    if (!next) return;
    const placement = operation.kind === 'transfer-block' || operation.kind === 'place-block';
    const { target, addedItem, addedBlock } = resolveOperationFocus(
      project,
      next,
      placement
        ? operation.targetItemId
        : operation.kind === 'set-row-start'
          ? operation.itemId
          : state.selectedId
    );
    if (target) {
      state.selectItem(target.id, next);
      setFocusRequest((current) => ({
        sequence: current.sequence + 1,
        ...(placement
          ? { preserveFocus: true }
          : addedItem
            ? {
                field: true,
                ...(addedItem.kind === 'step' && addedItem.blocks[0]?.kind === 'text'
                  ? { blockId: addedItem.blocks[0].id }
                  : {}),
              }
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
