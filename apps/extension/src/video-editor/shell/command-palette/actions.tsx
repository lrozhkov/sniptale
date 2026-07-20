import {
  Bug,
  Circle,
  Copy,
  Download,
  PanelsLeftRight,
  Pause,
  Play,
  Scissors,
  Square,
  Trash2,
  Type,
} from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { VideoProjectShapeType } from '../../../features/video/project/types';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import {
  commandPaletteIcon,
  createCommandPaletteRunAction,
  createCommandPaletteToggleAction,
} from '../../../ui/command-palette/action-builders';
import type { VideoEditorCommandPaletteController } from '../../runtime/controller/contracts/surface';

function buildVideoEditorProjectActions(
  controller: VideoEditorCommandPaletteController
): CommandPaletteAction[] {
  return [
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

function buildVideoEditorStageActions(
  controller: VideoEditorCommandPaletteController
): CommandPaletteAction[] {
  return [
    createCommandPaletteRunAction({
      id: 'video-editor-add-text',
      title: translate('videoEditor.stage.addText'),
      section: translate('shared.ui.commandPaletteToolsSection'),
      icon: commandPaletteIcon(Type),
      onSelect: () => {
        controller.onAddTextOverlay();
      },
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-add-rectangle',
      title: translate('videoEditor.stage.addRectangle'),
      section: translate('shared.ui.commandPaletteToolsSection'),
      icon: commandPaletteIcon(Square),
      onSelect: () => {
        void controller.onAddShapeOverlay(VideoProjectShapeType.RECTANGLE);
      },
    }),
    createCommandPaletteRunAction({
      id: 'video-editor-add-ellipse',
      title: translate('videoEditor.stage.addEllipse'),
      section: translate('shared.ui.commandPaletteToolsSection'),
      icon: commandPaletteIcon(Circle),
      onSelect: () => {
        void controller.onAddShapeOverlay(VideoProjectShapeType.ELLIPSE);
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
  controller: VideoEditorCommandPaletteController
): CommandPaletteAction[] {
  return [
    ...buildVideoEditorProjectActions(controller),
    ...buildVideoEditorPlaybackActions(controller),
    ...buildVideoEditorStageActions(controller),
    ...buildVideoEditorTimelineActions(controller),
  ];
}
