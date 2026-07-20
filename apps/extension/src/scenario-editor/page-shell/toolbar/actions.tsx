import {
  CheckCircle2,
  Clapperboard,
  Download,
  FolderKanban,
  Redo2,
  Sparkles,
  Undo2,
} from 'lucide-react';

import { translate } from '../../../platform/i18n';
import { EditorDivider, EditorIconButton, ValueBadge } from '@sniptale/ui/editor-chrome';
import type { ScenarioEditorToolbarController } from './types';

function ScenarioToolbarPanelActions(props: { controller: ScenarioEditorToolbarController }) {
  const togglePanelMode = (mode: 'projects' | 'ai-editor') => {
    const nextMode = props.controller.ui.leftPanelMode === mode ? 'navigator' : mode;

    if (nextMode !== 'navigator' && props.controller.ui.navigatorCollapsed) {
      props.controller.ui.setNavigatorCollapsed(false);
    }

    props.controller.ui.setLeftPanelMode(nextMode);
  };

  return (
    <>
      <EditorIconButton
        title={translate('scenario.editor.projectsTool')}
        active={props.controller.ui.leftPanelMode === 'projects'}
        onClick={() => togglePanelMode('projects')}
      >
        <FolderKanban size={18} strokeWidth={2} />
      </EditorIconButton>
      <EditorIconButton
        title={translate('scenario.editor.aiEditorTool')}
        active={props.controller.ui.leftPanelMode === 'ai-editor'}
        onClick={() => togglePanelMode('ai-editor')}
      >
        <Sparkles size={18} strokeWidth={2} />
      </EditorIconButton>
    </>
  );
}

function ScenarioToolbarHistoryActions(props: { controller: ScenarioEditorToolbarController }) {
  return (
    <>
      <EditorIconButton
        title={translate('scenario.editor.undo')}
        disabled={!props.controller.projectHistory.canUndoProject}
        onClick={props.controller.projectHistory.undoProjectChange}
      >
        <Undo2 size={18} strokeWidth={2} />
      </EditorIconButton>
      <EditorIconButton
        title={translate('scenario.editor.redo')}
        disabled={!props.controller.projectHistory.canRedoProject}
        onClick={props.controller.projectHistory.redoProjectChange}
      >
        <Redo2 size={18} strokeWidth={2} />
      </EditorIconButton>
    </>
  );
}

function getScenarioToolbarStatusMeta(saveState: 'error' | 'saved' | 'saving') {
  if (saveState === 'error') {
    return {
      className:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_30%,var(--sniptale-color-border-soft)_70%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger-soft)_72%,var(--sniptale-color-surface-panel)_28%)] ' +
        'text-[var(--sniptale-color-danger)]',
      label: translate('common.states.error'),
    };
  }

  if (saveState === 'saving') {
    return {
      className:
        'border-[color:color-mix(in_srgb,var(--sniptale-color-info)_30%,var(--sniptale-color-border-soft)_70%)] ' +
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-info)_14%,transparent)] ' +
        'text-[var(--sniptale-color-info)]',
      label: translate('common.states.saving'),
    };
  }

  return {
    className:
      'border-[color:color-mix(in_srgb,var(--sniptale-color-success)_30%,var(--sniptale-color-border-soft)_70%)] ' +
      'bg-[color:color-mix(in_srgb,var(--sniptale-color-success-soft)_88%,transparent)] ' +
      'text-[var(--sniptale-color-success)]',
    label: translate('common.states.saved'),
  };
}

function ScenarioToolbarStatusActions(props: {
  error: string | null;
  onExport: () => void;
  onOpenVideoEditor: () => void;
  saveState: 'error' | 'saved' | 'saving';
}) {
  const statusMeta = getScenarioToolbarStatusMeta(props.saveState);

  return (
    <div className="ml-auto flex items-center gap-2">
      <EditorDivider className="mx-3.5 h-8" />
      <ValueBadge
        className={`gap-1.5 ${statusMeta.className}`}
        {...(props.error === null ? {} : { title: props.error })}
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {statusMeta.label}
      </ValueBadge>
      <button
        type="button"
        onClick={props.onOpenVideoEditor}
        className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-4 py-1.5 text-sm font-semibold
          text-[var(--sniptale-color-text-primary)] transition hover:border-[var(--sniptale-color-border-strong)]"
      >
        <Clapperboard className="h-4 w-4" />
        {translate('scenario.editor.videoAction')}
      </button>
      <button
        type="button"
        onClick={props.onExport}
        className="inline-flex items-center gap-2 rounded-[12px] border border-[var(--sniptale-color-border-soft)]
          bg-[var(--sniptale-color-surface-panel)] px-4 py-1.5 text-sm font-semibold
          text-[var(--sniptale-color-text-primary)] transition hover:border-[var(--sniptale-color-border-strong)]"
      >
        <Download className="h-4 w-4" />
        {translate('scenario.editor.exportAction')}
      </button>
    </div>
  );
}

export function ScenarioToolbarActions(props: { controller: ScenarioEditorToolbarController }) {
  return (
    <div className="flex min-w-0 flex-1 items-center overflow-hidden px-3 py-1.5">
      <ScenarioToolbarPanelActions controller={props.controller} />
      <EditorDivider className="mx-3.5 h-8" />
      <ScenarioToolbarHistoryActions controller={props.controller} />
      <ScenarioToolbarStatusActions
        error={props.controller.project.error}
        onExport={() => props.controller.ui.setExportDialogOpen(true)}
        onOpenVideoEditor={() => void props.controller.projectCrud.openVideoEditor()}
        saveState={props.controller.project.saveState}
      />
    </div>
  );
}
