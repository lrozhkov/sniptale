import {
  Bug,
  Copy,
  Download,
  PanelsLeftRight,
  Pause,
  Play,
  Redo2,
  Scissors,
  Trash2,
  Undo2,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import {
  commandPaletteIcon,
  createCommandPaletteRunAction,
  createCommandPaletteToggleAction,
} from '../../../ui/command-palette/action-builders';
import type { VideoEditorProjectHistoryController } from '../../contracts/commands/history';
import type { VideoEditorCommandPaletteController } from '../../runtime/controller/contracts/surface';

function buildVideoEditorProjectActions(
  controller: VideoEditorCommandPaletteController,
  history: VideoEditorProjectHistoryController
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'video-editor-undo',
      title: translate('videoEditor.app.undo'),
      section: translate('shared.ui.commandPaletteProjectSection'),
      icon: commandPaletteIcon(Undo2),
      disabled: !history.canUndo,
      disabledReason: !history.canUndo
        ? translate(
            history.error ? 'videoEditor.app.historyError' : 'videoEditor.app.nothingToUndo'
          )
        : undefined,
      onSelect: history.onUndo,
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-redo',
      title: translate('videoEditor.app.redo'),
      section: translate('shared.ui.commandPaletteProjectSection'),
      icon: commandPaletteIcon(Redo2),
      disabled: !history.canRedo,
      disabledReason: !history.canRedo
        ? translate(
            history.error ? 'videoEditor.app.historyError' : 'videoEditor.app.nothingToRedo'
          )
        : undefined,
      onSelect: history.onRedo,
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-open-export',
      title: translate('videoEditor.app.exportButton'),
      section: translate('shared.ui.commandPaletteProjectSection'),
      icon: commandPaletteIcon(Download),
      onSelect: () => controller.onOpenExportDialog(),
    }),
    createCommandPaletteToggleAction({
      id: 'video-editor-toggle-sidebar',
      title: controller.leftSidebarCollapsed
        ? translate('videoEditor.app.expandInspector')
        : translate('videoEditor.app.collapseInspector'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(PanelsLeftRight),
      active: false,
      onSelect: () => {
        void controller.toggleSidebarCollapsed();
      },
    }),
    createCommandPaletteToggleAction({
      id: 'video-editor-toggle-diagnostics',
      title: translate('videoEditor.sidebar.diagnosticsTitle'),
      section: translate('shared.ui.commandPaletteWorkspaceSection'),
      icon: commandPaletteIcon(Bug),
      active: false,
      onSelect: () => {
        void controller.toggleDiagnostics();
      },
    }),
  ];
}

function buildVideoEditorPlaybackActions(
  controller: VideoEditorCommandPaletteController
): CommandPaletteAction[] {
  return [
    createCommandPaletteToggleAction({
      id: 'video-editor-toggle-playback',
      title: controller.isPlaying
        ? translate('videoEditor.timeline.pause')
        : translate('videoEditor.timeline.play'),
      section: translate('shared.ui.commandPalettePlaybackSection'),
      icon: controller.isPlaying ? commandPaletteIcon(Pause) : commandPaletteIcon(Play),
      active: controller.isPlaying,
      onSelect: () => {
        void controller.togglePlaying();
      },
    }),
  ];
}

function buildVideoEditorTimelineActions(
  controller: VideoEditorCommandPaletteController
): CommandPaletteAction[] {
  const selectedClipId = controller.selectedClipId;
  const selectedClipMissingReason = translate('videoEditor.stage.noSelection');

  return [
    createCommandPaletteRunAction({
      id: 'video-editor-split-clip',
      title: translate('videoEditor.timeline.split'),
      section: translate('videoEditor.timeline.title'),
      icon: commandPaletteIcon(Scissors),
      disabled: !selectedClipId,
      disabledReason: !selectedClipId ? selectedClipMissingReason : undefined,
      onSelect: () => {
        void controller.onSplitSelectedClip();
      },
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-duplicate-clip',
      title: translate('videoEditor.timeline.duplicate'),
      section: translate('videoEditor.timeline.title'),
      icon: commandPaletteIcon(Copy),
      disabled: !selectedClipId,
      disabledReason: !selectedClipId ? selectedClipMissingReason : undefined,
      onSelect: () => {
        void controller.onDuplicateSelectedClip();
      },
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-delete-clip',
      title: translate('videoEditor.timeline.delete'),
      section: translate('videoEditor.timeline.title'),
      icon: commandPaletteIcon(Trash2),
      disabled: !selectedClipId,
      disabledReason: !selectedClipId ? selectedClipMissingReason : undefined,
      onSelect: () => {
        controller.onDeleteSelectedClip();
      },
    }),
  ];
}

export function buildVideoEditorCommandPaletteActions(
  controller: VideoEditorCommandPaletteController,
  history: VideoEditorProjectHistoryController
): CommandPaletteAction[] {
  return [
    ...buildVideoEditorProjectActions(controller, history),
    ...buildVideoEditorPlaybackActions(controller),
    ...buildVideoEditorTimelineActions(controller),
  ];
}
