import { translate } from '../../../platform/i18n';
import { CanvasInsertToolPanel, CanvasWorkspaceToolPanel } from '@sniptale/ui/canvas-tools';
import { floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import {
  useVideoEditorTimelineController,
  useWorkspaceDialogsContext,
  useWorkspaceGridContext,
  useWorkspaceInspectorContext,
} from '../../runtime/controller/composition/hooks';
import { useVideoEditorClipSelectionPort } from '../../runtime/controller/store';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { buildVideoInsertActions, buildVideoWorkspaceActions } from './actions';

const INSERT_STACK_CLASS_NAME = floatingChromeClassNames('relative z-40 flex min-w-0 items-center');
const WORKSPACE_STACK_CLASS_NAME = floatingChromeClassNames(
  'relative z-40 flex min-w-0 items-center'
);

const TOP_PANEL_CLASS_NAME = floatingChromeClassNames(
  'flex-row items-center overflow-visible',
  '!bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_99%,var(--sniptale-color-surface-canvas)_1%)]',
  '!backdrop-blur-none'
);

export function VideoEditorFloatingInsertPanel(props: {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
}) {
  const timeline = useVideoEditorTimelineController();
  if (!timeline) return null;
  const insertion = timeline.actions.insertion;

  return (
    <div data-ui="video-editor.floating.insert-panel.stack" className={INSERT_STACK_CLASS_NAME}>
      <CanvasInsertToolPanel
        actions={buildVideoInsertActions({
          activeInsertKind: props.activeInsertKind,
          effectsLibraryDock: props.effectsLibraryDock,
          insertion,
          onActiveInsertKindChange: props.onActiveInsertKindChange,
        })}
        className={TOP_PANEL_CLASS_NAME}
        dataUi="video-editor.floating.insert-panel"
        label={translate('videoEditor.timeline.addMenuTitle')}
      />
    </div>
  );
}

export function VideoEditorFloatingWorkspacePanel() {
  const grid = useWorkspaceGridContext();
  const inspector = useWorkspaceInspectorContext();
  const dialogs = useWorkspaceDialogsContext();
  const selection = useVideoEditorClipSelectionPort((port) => port.selection);
  const selectScene = useVideoEditorClipSelectionPort((port) => port.selectScene);
  return (
    <div
      data-ui="video-editor.floating.workspace-panel.stack"
      className={WORKSPACE_STACK_CLASS_NAME}
    >
      <CanvasWorkspaceToolPanel
        actions={buildVideoWorkspaceActions({
          grid: { magnetEnabled: grid.magnetEnabled, onToggleMagnet: grid.toggleMagnet },
          inspectorMode: inspector.mode,
          onOpenAudioRecordingDialog: dialogs.openAudioRecordingDialog,
          onOpenGridSettings: inspector.openGridSettings,
          onSelectScene: () => {
            selectScene();
            inspector.openSelection();
          },
          selection,
        })}
        className={TOP_PANEL_CLASS_NAME}
        dataUi="video-editor.floating.workspace-panel"
        label={translate('shared.ui.commandPaletteWorkspaceSection')}
      />
    </div>
  );
}
