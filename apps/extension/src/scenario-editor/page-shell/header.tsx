import { AutosaveControl } from '@sniptale/ui/autosave-control';
import { GuideSnapButton, GuideBoundariesButton } from './layout-assistance';
import { GuideVoiceField } from './voice-field';
import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { GuideAiEntry } from './ai-assistant';
import { GuideProjectActions } from './project-actions';
import type { useGuidePageState } from './runtime/use-state';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { Undo2, Redo2, Download, Palette } from 'lucide-react';

type GuidePageHeaderProps = {
  project: GuideProject | null;
  images?: Record<string, string | null>;
  panelControls?: ReactNode;
  aiSelection?: { stepId: string | null; blockId: string | null };
  onAiOpen?: () => void;
  prepareAiProject?: () => Promise<GuideProject | null>;
  onAppearance: () => void;
  appearanceActive?: boolean;
  leftControls?: ReactNode;
  contextControls?: ReactNode;
  representationControls?: ReactNode;
  showSnap?: boolean;
  status: ReturnType<typeof useGuidePageState>['status'];
  commandsDisabled: boolean;
  onDuplicate: (name: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReload: () => Promise<void>;
  onPreview: () => void;
  previewRef: Ref<HTMLButtonElement>;
  previewDisabled: boolean;
  disabled: boolean;
  feedback?: ReactNode;
  autosaveEnabled?: boolean;
  onAutosaveChange?: (enabled: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
};

export function GuidePageHeader({
  project,
  images = {},
  panelControls,
  aiSelection,
  onAiOpen,
  prepareAiProject,
  onAppearance,
  appearanceActive = false,
  leftControls,
  contextControls,
  representationControls,
  showSnap = true,
  status,
  commandsDisabled,
  onDuplicate,
  onDelete,
  onReload,
  onPreview,
  previewRef,
  previewDisabled,
  disabled,
  feedback,
  autosaveEnabled = true,
  onAutosaveChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onChange,
  t,
}: GuidePageHeaderProps) {
  const headerRef = useHeaderFit();
  return (
    <>
      <header className="guide-page-header" ref={headerRef}>
        {leftControls}
        {representationControls}
        {project?.purpose === 'step-template' && (
          <span className="guide-template-mode">{t('scenario.editor.templateEditing')}</span>
        )}
        {project && (
          <label className="guide-project-name">
            <span aria-hidden="true" className="guide-project-name-measure">
              {project.name || ' '}
            </span>
            <GuideVoiceField
              key={project.id}
              singleLine
              aria-label={t('scenario.editor.projectLabel')}
              disabled={disabled}
              value={project.name}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              onValueChange={(value) => onChange({ ...project, name: value }, 'project-name')}
            />
          </label>
        )}
        <div className="guide-header-actions">
          {contextControls}
          {aiSelection && onAiOpen && prepareAiProject && (
            <GuideAiEntry
              images={images}
              project={project}
              selectedStepId={aiSelection.stepId}
              selectedBlockId={aiSelection.blockId}
              status={status}
              disabled={disabled}
              prepareProject={prepareAiProject}
              onOpen={onAiOpen}
              onChange={onChange}
              onReload={onReload}
              t={t}
            />
          )}
          {project && (
            <>
              {showSnap && (
                <>
                  <GuideSnapButton t={t} disabled={disabled} />
                  <GuideBoundariesButton t={t} disabled={disabled} />
                </>
              )}
              <ContentToolbarButton
                className="guide-labeled-action"
                data-header-collapse="2"
                title={t('scenario.editor.appearance')}
                aria-pressed={appearanceActive}
                onClick={onAppearance}
              >
                <Palette size={16} aria-hidden="true" />
                <span>{t('scenario.editor.appearance')}</span>
              </ContentToolbarButton>
              <ContentToolbarButton
                className="guide-labeled-action"
                data-header-collapse="1"
                ref={previewRef}
                title={t('scenario.editor.guideReaderOpen')}
                disabled={previewDisabled}
                onClick={onPreview}
              >
                <Download size={16} aria-hidden="true" />
                <span>{t('scenario.editor.guideReaderOpen')}</span>
              </ContentToolbarButton>
              <GuideHistoryAutosave
                disabled={disabled}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={onUndo}
                onRedo={onRedo}
                enabled={autosaveEnabled}
                onChange={onAutosaveChange}
                status={status}
                t={t}
              />
              <GuideProjectActions
                project={project}
                disabled={commandsDisabled}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                t={t}
              />
            </>
          )}
          {panelControls}
        </div>
      </header>
      {feedback}
    </>
  );
}

/** Collapse action labels in product priority order using actual available header width. */
function useHeaderFit() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const header = ref.current;
    if (!header) return;
    const fit = () => {
      header.removeAttribute('data-wrapped');
      const buttons = [...header.querySelectorAll<HTMLElement>('[data-header-collapse]')].sort(
        (a, b) => Number(a.dataset['headerCollapse']) - Number(b.dataset['headerCollapse'])
      );
      for (const button of buttons) button.removeAttribute('data-icon-only');
      for (const button of buttons) {
        if (header.scrollWidth <= header.clientWidth) break;
        button.setAttribute('data-icon-only', 'true');
      }
      if (header.scrollWidth > header.clientWidth) header.setAttribute('data-wrapped', 'true');
    };
    fit();
    const observer = globalThis.ResizeObserver ? new ResizeObserver(fit) : null;
    observer?.observe(header);
    return () => observer?.disconnect();
  });
  return ref;
}

function guideAutosaveState(status: GuidePageHeaderProps['status']) {
  if (status === 'conflict' || status === 'saving' || status === 'dirty') return status;
  if (status === 'loading') return 'saving';
  return status === 'failed' || status === 'unavailable' || status === 'missing'
    ? 'error'
    : 'saved';
}

function GuideHistoryAutosave(props: {
  disabled: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  enabled: boolean;
  onChange: ((enabled: boolean) => void) | undefined;
  status: GuidePageHeaderProps['status'];
  t: Translate;
}) {
  return (
    <>
      {(props.status === 'ready' ||
        props.status === 'saved' ||
        props.status === 'dirty' ||
        props.status === 'saving') && (
        <span className="sr-only" role="status" aria-live="polite">
          {props.t(
            props.status === 'dirty'
              ? 'scenario.editor.guideDirty'
              : props.status === 'saving'
                ? 'scenario.editor.guideSaving'
                : 'scenario.editor.guideSaved'
          )}
        </span>
      )}
      <div
        className="guide-history-controls"
        role="group"
        aria-label={props.t('scenario.editor.guideHistoryActions')}
      >
        <ContentToolbarButton
          type="button"
          disabled={props.disabled || !props.canUndo}
          onClick={props.onUndo}
          title={props.t('scenario.editor.guideUndoHint')}
          aria-label={props.t('scenario.editor.guideUndo')}
        >
          <Undo2 size={16} aria-hidden="true" />
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
          disabled={props.disabled || !props.canRedo}
          onClick={props.onRedo}
          title={props.t('scenario.editor.guideRedoHint')}
          aria-label={props.t('scenario.editor.guideRedo')}
        >
          <Redo2 size={16} aria-hidden="true" />
        </ContentToolbarButton>
      </div>
      {props.onChange && (
        <>
          <span
            aria-hidden="true"
            className="mx-1 h-5 w-px shrink-0 bg-[var(--sniptale-color-border-soft)]"
          />
          <GuideAutosaveStatus
            enabled={props.enabled}
            onChange={props.onChange}
            status={props.status}
            t={props.t}
          />
        </>
      )}
    </>
  );
}

function GuideAutosaveStatus(props: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  status: GuidePageHeaderProps['status'];
  t: Translate;
}) {
  return (
    <AutosaveControl
      enabled={props.enabled}
      onChange={props.onChange}
      state={guideAutosaveState(props.status)}
      labels={{
        title: props.t('editor.documentActions.autosaveTitle'),
        switch: props.t('editor.documentActions.autosaveSwitch'),
        errorDescription: props.t('editor.documentActions.autosaveErrorDescription'),
        on: props.t('editor.documentActions.autosaveOnDescription'),
        off: props.t('editor.documentActions.autosaveOffDescription'),
        paused: props.t('editor.documentActions.autosaveOffStatus'),
        dirty: props.t('common.states.dirty'),
        saving: props.t(
          props.status === 'loading' ? 'scenario.editor.loading' : 'common.states.saving'
        ),
        saved: props.t('common.states.saved'),
        error: props.t('editor.documentActions.saveErrorTitle'),
        conflict: props.t('editor.documentActions.autosaveConflict'),
        close: props.t('common.actions.close'),
      }}
    />
  );
}

/** Presents operation impact and confirmed recovery without occupying the title/action row. */
export function GuidePageFeedback({
  status,
  onRetry,
  onReload,
  disabled,
  actionError,
  t,
}: {
  status: GuidePageHeaderProps['status'];
  onRetry: (() => Promise<boolean>) | undefined;
  onReload: (() => Promise<void>) | undefined;
  disabled: boolean;
  actionError: ReturnType<typeof useGuidePageState>['actionError'];
  t: Translate;
}) {
  const [confirmReload, setConfirmReload] = useState(false);
  const failed = status === 'failed' || status === 'conflict';
  if (!failed && !actionError) return null;
  return (
    <div className="guide-page-feedback" data-status={status}>
      <GuideFeedbackMessage status={status} actionError={actionError} t={t} />
      {(failed || actionError === 'reload') && (
        <div className="guide-feedback-actions">
          {status === 'failed' && onRetry && (
            <ProductActionButton
              tone="secondary"
              compact
              disabled={disabled}
              onClick={() => void onRetry()}
            >
              {t('common.actions.retry')}
            </ProductActionButton>
          )}
          {onReload && (
            <ProductActionButton
              tone="secondary"
              compact
              disabled={disabled}
              onClick={() => setConfirmReload(true)}
            >
              {t('scenario.editor.guideReload')}
            </ProductActionButton>
          )}
        </div>
      )}
      <ProductConfirmDialog
        isOpen={confirmReload}
        isLoading={disabled}
        title={t('scenario.editor.guideReload')}
        message={t('scenario.editor.guideReloadMessage')}
        confirmText={t('scenario.editor.guideReload')}
        cancelText={t('common.actions.cancel')}
        onCancel={() => setConfirmReload(false)}
        onConfirm={async () => {
          await onReload?.();
          setConfirmReload(false);
        }}
      />
    </div>
  );
}

function GuideFeedbackMessage({
  status,
  actionError,
  t,
}: {
  status: GuidePageHeaderProps['status'];
  actionError: ReturnType<typeof useGuidePageState>['actionError'];
  t: Translate;
}) {
  const failed = status === 'failed' || status === 'conflict';
  const actionMessages = {
    template: 'scenario.editor.templateFailed',
    copy: 'scenario.editor.guideCopyFailed',
    edit: 'scenario.editor.guideImageApplyFailed',
    import: 'scenario.editor.guideImportFailed',
    structure: 'scenario.editor.guideOperationFailed',
    delete: 'scenario.editor.guideDeleteFailed',
    reload: 'scenario.editor.guideReloadFailed',
  } as const;
  const context =
    status === 'saved' || status === 'ready'
      ? 'scenario.editor.guideOperationDocumentSaved'
      : status === 'saving'
        ? 'scenario.editor.guideSaving'
        : status === 'loading'
          ? 'scenario.editor.loading'
          : 'scenario.editor.guideDirty';
  return (
    <div className="guide-feedback-message" role="alert">
      {failed && (
        <p>
          {t(status === 'failed' ? 'scenario.editor.guideFailed' : 'scenario.editor.guideConflict')}
        </p>
      )}
      {actionError && <p>{t(actionMessages[actionError])}</p>}
      {!failed && <p className="guide-feedback-context">{t(context)}</p>}
    </div>
  );
}
