import { type ReactNode, type Ref, type ComponentProps } from 'react';
import { GuideAiEntry } from './ai-assistant';
import { GuideProjectActions } from './project-actions';
import { GUIDE_LIMITS, type GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { Translate } from '../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { Undo2, Redo2, Download } from 'lucide-react';

export function GuidePageHeader({
  project,
  panelControls,
  aiSelection,
  onAiOpen,
  leftControls,
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
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onChange,
  t,
}: {
  project: GuideProject | null;
  panelControls?: ReactNode;
  aiSelection?: { stepId: string | null; blockId: string | null };
  onAiOpen?: () => void;
  leftControls?: ReactNode;
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
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onChange: (project: GuideProject, group?: string | null) => void;
  t: Translate;
}) {
  return (
    <>
      <header className="guide-page-header">
        {leftControls}
        {project && (
          <label className="guide-project-name">
            <span aria-hidden="true" className="guide-project-name-measure">
              {project.name || ' '}
            </span>
            <input
              aria-label={t('scenario.editor.projectLabel')}
              disabled={disabled}
              value={project.name}
              maxLength={GUIDE_LIMITS.maxLabelLength}
              onChange={(event) =>
                onChange({ ...project, name: event.target.value }, 'project-name')
              }
            />
          </label>
        )}
        {feedback}
        <div className="guide-header-actions">
          {aiSelection && onAiOpen && (
            <GuideAiEntry
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
              <ContentToolbarButton
                className="guide-labeled-action"
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
              <GuideProjectActions
                project={project}
                disabled={commandsDisabled}
                status={status}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onReload={onReload}
                onChange={onChange}
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
