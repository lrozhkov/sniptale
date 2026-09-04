import { ImagePlus, LayoutTemplate, MonitorCog } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { TranslationKey } from '../../../platform/i18n';
import type { CanvasToolAction } from '@sniptale/ui/canvas-tools';
import {
  createCanvasFileToolAction,
  createCanvasToolAction,
} from '@sniptale/ui/canvas-tools/descriptors';
import type { VideoEditorTimelineController } from '../../runtime/controller/contracts/timeline';
import type { VideoEditorSelection } from '../../contracts/selection';
import { PROJECT_MEDIA_ACCEPT_ATTRIBUTE } from '../../project/operations/import-validation';
import { VideoEditorSelectionKind } from '../../contracts/selection';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { dispatchVideoEditorMediaImport } from './media-import';

type FloatingEffectsLibraryDock = {
  isOpen: boolean;
  onToggle: () => void;
};

export function buildVideoInsertActions(args: {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  effectsLibraryDock: FloatingEffectsLibraryDock;
  insertion: VideoEditorTimelineController['actions']['insertion'];
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
}) {
  return [
    createSelectMoveAction(args.activeInsertKind, args.onActiveInsertKindChange),
    createMediaInsertAction(args.insertion),
    createTemplatesInsertAction(args.effectsLibraryDock),
  ] satisfies CanvasToolAction[];
}

export function buildVideoWorkspaceActions(controller: {
  grid: { magnetEnabled: boolean; onToggleMagnet: () => void };
  inspectorMode: 'grid' | 'selection';
  onOpenAudioRecordingDialog: () => void;
  onOpenGridSettings: () => void;
  onSelectScene: () => void;
  selection: VideoEditorSelection;
}) {
  const gridActive = controller.inspectorMode === 'grid';
  const sceneActive =
    controller.inspectorMode === 'selection' &&
    controller.selection.kind === VideoEditorSelectionKind.SCENE;

  return [
    createSceneWorkspaceAction(controller, sceneActive),
    createSettingsWorkspaceAction('grid', gridActive, controller.onOpenGridSettings),
    createSettingsWorkspaceAction(
      'magnet',
      controller.grid.magnetEnabled,
      controller.grid.onToggleMagnet
    ),
    createCanvasToolAction({
      group: 'editor',
      id: 'record-audio',
      kind: 'record-audio',
      label: translate('videoEditor.app.recordAudioButton'),
      onSelect: controller.onOpenAudioRecordingDialog,
    }),
  ] satisfies CanvasToolAction[];
}

function createSelectMoveAction(
  activeInsertKind: VideoPreviewCanvasInsertKind | null,
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void
) {
  return createCanvasToolAction({
    active: activeInsertKind === null,
    group: 'primary',
    id: 'select-move',
    kind: 'select',
    label: translate('videoEditor.app.selectMoveButton'),
    onSelect: () => onActiveInsertKindChange(null),
  });
}

function createMediaInsertAction(insertion: VideoEditorTimelineController['actions']['insertion']) {
  return createCanvasFileToolAction({
    accept: PROJECT_MEDIA_ACCEPT_ATTRIBUTE,
    group: 'editor',
    icon: <ImagePlus size={18} strokeWidth={2} />,
    id: 'media',
    kind: 'video',
    label: translate('videoEditor.app.mediaButton'),
    onSelectFile: (file) => {
      dispatchVideoEditorMediaImport(insertion.onImport, file, insertion.onUnsupportedFileDrop);
    },
  });
}

function createTemplatesInsertAction(
  effectsLibraryDock: Pick<FloatingEffectsLibraryDock, 'isOpen' | 'onToggle'>
) {
  return createCanvasToolAction({
    active: effectsLibraryDock.isOpen,
    group: 'editor',
    icon: <LayoutTemplate size={18} strokeWidth={2} />,
    id: 'templates',
    kind: 'layout',
    label: translate('videoEditor.effectsLibrary.button'),
    onSelect: effectsLibraryDock.onToggle,
  });
}

function createSceneWorkspaceAction(
  controller: Pick<Parameters<typeof buildVideoWorkspaceActions>[0], 'onSelectScene'>,
  active: boolean
) {
  return createCanvasToolAction({
    active,
    group: 'workspace',
    icon: <MonitorCog size={18} strokeWidth={2} />,
    id: 'scene',
    kind: 'scene',
    label: translate('videoEditor.sidebar.sceneProperties'),
    onSelect: controller.onSelectScene,
  });
}

function createSettingsWorkspaceAction(
  kind: 'grid' | 'magnet',
  active: boolean,
  onSelect: () => void
) {
  const labelKeys: Record<'grid' | 'magnet', TranslationKey> = {
    grid: 'videoEditor.app.gridButton',
    magnet: 'videoEditor.app.magnetButton',
  };
  return createCanvasToolAction({
    active,
    group: 'workspace',
    id: kind,
    kind,
    label: translate(labelKeys[kind]),
    onSelect,
  });
}
