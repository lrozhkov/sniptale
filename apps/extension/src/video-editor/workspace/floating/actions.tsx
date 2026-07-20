import { ImagePlus, LayoutTemplate, MonitorCog } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import type { TranslationKey } from '../../../platform/i18n';
import {
  createCommonCanvasPointInsertAction,
  type CanvasToolAction,
} from '@sniptale/ui/canvas-tools';
import {
  createCanvasFileToolAction,
  createCanvasToolAction,
} from '@sniptale/ui/canvas-tools/descriptors';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
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
  insertion: VideoEditorWorkspaceController['timeline']['actions']['insertion'];
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
}) {
  const toggleCanvasInsert = (kind: VideoPreviewCanvasInsertKind) =>
    args.onActiveInsertKindChange(args.activeInsertKind === kind ? null : kind);

  return [
    createSelectMoveAction(args.activeInsertKind, args.onActiveInsertKindChange),
    ...buildVideoPointInsertActions(args.activeInsertKind, toggleCanvasInsert),
    createMediaInsertAction(args.insertion),
    createTemplatesInsertAction(args.effectsLibraryDock),
  ] satisfies CanvasToolAction[];
}

export function buildVideoWorkspaceActions(controller: VideoEditorWorkspaceController) {
  const gridActive = controller.header.inspectorMode === 'grid';
  const sceneActive =
    controller.header.inspectorMode === 'selection' &&
    controller.sidebar.state.selection?.kind === VideoEditorSelectionKind.SCENE;

  return [
    createSceneWorkspaceAction(controller, sceneActive),
    createSettingsWorkspaceAction('grid', gridActive, controller.header.onOpenGridSettings),
    createSettingsWorkspaceAction(
      'magnet',
      controller.header.grid.magnetEnabled,
      controller.header.grid.onToggleMagnet
    ),
    createCanvasToolAction({
      group: 'editor',
      id: 'record-audio',
      kind: 'record-audio',
      label: translate('videoEditor.app.recordAudioButton'),
      onSelect: controller.header.onOpenAudioRecordingDialog,
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

function buildVideoPointInsertActions(
  activeInsertKind: VideoPreviewCanvasInsertKind | null,
  toggleCanvasInsert: (kind: VideoPreviewCanvasInsertKind) => void
) {
  const actions = [
    ['text', 'videoEditor.stage.addText', 'text'],
    ['shape', 'videoEditor.stage.addRectangle', 'shape'],
    ['line', 'videoEditor.stage.addLine', 'line'],
    ['arrow', 'videoEditor.stage.addArrow', 'arrow'],
  ] as const;

  return actions.map(([kind, labelKey, target]) =>
    createCommonCanvasPointInsertAction({
      active: activeInsertKind === kind,
      group: 'secondary',
      kind,
      label: translate(labelKey),
      target,
      onSelect: toggleCanvasInsert,
    })
  );
}

function createMediaInsertAction(
  insertion: VideoEditorWorkspaceController['timeline']['actions']['insertion']
) {
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

function createSceneWorkspaceAction(controller: VideoEditorWorkspaceController, active: boolean) {
  return createCanvasToolAction({
    active,
    group: 'workspace',
    icon: <MonitorCog size={18} strokeWidth={2} />,
    id: 'scene',
    kind: 'scene',
    label: translate('videoEditor.sidebar.sceneProperties'),
    onSelect: controller.header.onSelectScene,
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
