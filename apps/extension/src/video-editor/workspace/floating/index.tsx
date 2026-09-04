import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorFloatingDocumentBar } from './document-bar';
import { VideoEditorFloatingInsertPanel, VideoEditorFloatingWorkspacePanel } from './top-panels';

type VideoEditorFloatingWorkspaceProps = {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
};

export function VideoEditorFloatingWorkspace({
  activeInsertKind,
  effectsLibraryDock,
  onActiveInsertKindChange,
}: VideoEditorFloatingWorkspaceProps) {
  return (
    <div data-ui="video-editor.floating-workspace" className="flex shrink-0 flex-col gap-2 p-3">
      <VideoEditorFloatingDocumentBar />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <VideoEditorFloatingInsertPanel
          activeInsertKind={activeInsertKind}
          effectsLibraryDock={effectsLibraryDock}
          onActiveInsertKindChange={onActiveInsertKindChange}
        />
        <VideoEditorFloatingWorkspacePanel />
      </div>
    </div>
  );
}
