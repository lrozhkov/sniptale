import { FloatingChromeRoot } from '@sniptale/ui/floating-chrome';
import type React from 'react';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorFloatingDocumentBar } from './document-bar';
import { VideoEditorFloatingInspectorStack } from './inspector-stack';
import { VideoEditorFloatingInsertPanel, VideoEditorFloatingWorkspacePanel } from './top-panels';

type VideoEditorFloatingWorkspaceProps = {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  diagnosticsContent: React.ReactNode;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
};

export function VideoEditorFloatingWorkspace({
  activeInsertKind,
  diagnosticsContent,
  effectsLibraryDock,
  onActiveInsertKindChange,
}: VideoEditorFloatingWorkspaceProps) {
  return (
    <FloatingChromeRoot dataUi="video-editor.floating-workspace">
      <VideoEditorFloatingDocumentBar />
      <VideoEditorFloatingInsertPanel
        activeInsertKind={activeInsertKind}
        effectsLibraryDock={effectsLibraryDock}
        onActiveInsertKindChange={onActiveInsertKindChange}
      />
      <VideoEditorFloatingWorkspacePanel />
      <VideoEditorFloatingInspectorStack diagnosticsContent={diagnosticsContent} />
    </FloatingChromeRoot>
  );
}
