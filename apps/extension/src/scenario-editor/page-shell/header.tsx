import { AutosaveControl } from '@sniptale/ui/autosave-control';
import { GuideSnapButton } from './layout-assistance';
import { GuideVoiceField } from './voice-field';
import { useLayoutEffect, useRef, type ReactNode, type Ref, type ComponentProps } from 'react';
import { GuideAiEntry } from './ai-assistant';
import { GuideProjectActions } from './project-actions';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Undo2, Redo2, Download, Palette } from 'lucide-react';

type GuidePageHeaderProps = {
  project: GuideProject | null;
  images?: Record<string, string | null>;
  panelControls?: ReactNode;
  aiSelection?: { stepId: string | null; blockId: string | null };
  onAiOpen?: () => void;
  onAppearance: () => void;
  appearanceActive?: boolean;
  leftControls?: ReactNode;
  contextControls?: ReactNode;
  representationControls?: ReactNode;
  showSnap?: boolean;
  status: ComponentProps<typeof GuideProjectActions>['status'];
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
        {feedback}
        <div className="guide-header-actions">
          {contextControls}
          {aiSelection && onAiOpen && (
            <GuideAiEntry
              images={images}
              project={project}
              selectedStepId={aiSelection.stepId}
              selectedBlockId={aiSelection.blockId}
              status={status}
              disabled={commandsDisabled}
              onOpen={onAiOpen}
              onChange={onChange}
              onReload={onReload}
              t={t}
            />
          )}
          {project && (
            <>
              {showSnap && <GuideSnapButton t={t} disabled={disabled} />}
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
              <div
                className="guide-history-controls"
                role="group"
                aria-label={t('scenario.editor.guideHistoryActions')}
              >
                <ContentToolbarButton
                  type="button"
                  disabled={disabled || !canUndo}
                  onClick={onUndo}
                  title={t('scenario.editor.guideUndoHint')}
                  aria-label={t('scenario.editor.guideUndo')}
                >
                  <Undo2 size={16} aria-hidden="true" />
                </ContentToolbarButton>
                <ContentToolbarButton
                  type="button"
                  disabled={disabled || !canRedo}
                  onClick={onRedo}
                  title={t('scenario.editor.guideRedoHint')}
                  aria-label={t('scenario.editor.guideRedo')}
                >
                  <Redo2 size={16} aria-hidden="true" />
                </ContentToolbarButton>
              </div>
              <GuideAutosaveStatus
                enabled={autosaveEnabled}
                onChange={onAutosaveChange}
                status={status}
                t={t}
              />
              <GuideProjectActions
                project={project}
                disabled={commandsDisabled}
                status={status}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onReload={onReload}
                t={t}
              />
            </>
          )}
          {panelControls}
        </div>
      </header>
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
      const buttons = [...header.querySelectorAll<HTMLElement>('[data-header-collapse]')].sort(
        (a, b) => Number(a.dataset['headerCollapse']) - Number(b.dataset['headerCollapse'])
      );
      for (const button of buttons) button.removeAttribute('data-icon-only');
      for (const button of buttons) {
        if (header.scrollWidth <= header.clientWidth) break;
        button.setAttribute('data-icon-only', 'true');
      }
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
  return status === 'failed' ? 'error' : 'saved';
}

function GuideAutosaveStatus(props: {
  enabled: boolean;
  onChange: ((enabled: boolean) => void) | undefined;
  status: GuidePageHeaderProps['status'];
  t: Translate;
}) {
  if (!props.onChange) return null;
  return (
    <AutosaveControl
      enabled={props.enabled}
      onChange={props.onChange}
      state={guideAutosaveState(props.status)}
      labels={{
        title: props.t('editor.documentActions.autosaveTitle'),
        on: props.t('editor.documentActions.autosaveOnDescription'),
        off: props.t('editor.documentActions.autosaveOffDescription'),
        paused: props.t('editor.documentActions.autosaveOffStatus'),
        dirty: props.t('common.states.dirty'),
        saving: props.t('common.states.saving'),
        saved: props.t('common.states.saved'),
        error: props.t('editor.documentActions.saveErrorTitle'),
        conflict: props.t('editor.documentActions.autosaveConflict'),
        close: props.t('common.actions.close'),
      }}
    />
  );
}
