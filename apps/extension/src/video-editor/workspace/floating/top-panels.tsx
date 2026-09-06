import { CanvasToolButtons } from '@sniptale/ui/canvas-tools';
import {
  useVideoEditorTimelineController,
  useWorkspaceDialogsContext,
  useWorkspaceGridContext,
  useWorkspaceInspectorContext,
} from '../../runtime/controller/composition/hooks';
import { useVideoEditorClipSelectionPort } from '../../runtime/controller/store';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { buildVideoInsertActions, buildVideoWorkspaceActions } from './actions';

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
    <div data-ui="video-editor.floating.insert-panel.stack" className="flex shrink-0 items-center">
      <CanvasToolButtons
        actions={buildVideoInsertActions({
          activeInsertKind: props.activeInsertKind,
          effectsLibraryDock: props.effectsLibraryDock,
          insertion,
          onActiveInsertKindChange: props.onActiveInsertKindChange,
        })}
        dataUi="video-editor.floating.insert-panel"
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
      className="ml-auto flex shrink-0 items-center"
    >
      <CanvasToolButtons
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
        dataUi="video-editor.floating.workspace-panel"
      />
    </div>
  );
}
