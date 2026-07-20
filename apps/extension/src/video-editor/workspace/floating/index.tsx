import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorFloatingDocumentBar } from './document-bar';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';
import { VideoEditorFloatingInsertPanel, VideoEditorFloatingWorkspacePanel } from './top-panels';

type VideoEditorFloatingWorkspaceProps = {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  controller: VideoEditorWorkspaceController;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
};

export function VideoEditorFloatingWorkspace({
  activeInsertKind,
  controller,
  effectsLibraryDock,
  onActiveInsertKindChange,
}: VideoEditorFloatingWorkspaceProps) {
  return (
    <FloatingChromeRoot dataUi="video-editor.floating-workspace">
      <VideoEditorFloatingDocumentBar header={controller.header} />
      <VideoEditorFloatingInsertPanel
        activeInsertKind={activeInsertKind}
        controller={controller}
        effectsLibraryDock={effectsLibraryDock}
        onActiveInsertKindChange={onActiveInsertKindChange}
      />
      <VideoEditorFloatingWorkspacePanel controller={controller} />
      <VideoEditorFloatingInspectorStack controller={controller} />
    </FloatingChromeRoot>
  );
}
