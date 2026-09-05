import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import { FolderOpen } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { VideoEditorFloatingDocumentBar } from './document-bar';
import { VideoEditorFloatingInsertPanel, VideoEditorFloatingWorkspacePanel } from './top-panels';

type VideoEditorFloatingWorkspaceProps = {
  inspector?: { isOpen: boolean; onToggle: () => void };
  materials?: { isOpen: boolean; onToggle: () => void };
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  effectsLibraryDock: {
    isOpen: boolean;
    onToggle: () => void;
  };
  onActiveInsertKindChange: (kind: VideoPreviewCanvasInsertKind | null) => void;
};

export function VideoEditorFloatingWorkspace({
  inspector,
  materials,
  activeInsertKind,
  effectsLibraryDock,
  onActiveInsertKindChange,
}: VideoEditorFloatingWorkspaceProps) {
  return (
    <div data-ui="video-editor.floating-workspace" className="flex shrink-0 flex-col gap-2 p-3">
      <VideoEditorFloatingDocumentBar {...(inspector ? { inspector } : {})} />
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {materials && (
            <FloatingChromeToolbar>
              <ContentToolbarButton
                className="!w-auto gap-2 !px-3"
                active={materials.isOpen}
                aria-pressed={materials.isOpen}
                onClick={materials.onToggle}
              >
                <FolderOpen size={17} aria-hidden="true" />
                {translate('videoEditor.app.materialsTitle')}
              </ContentToolbarButton>
            </FloatingChromeToolbar>
          )}
          <VideoEditorFloatingInsertPanel
            activeInsertKind={activeInsertKind}
            effectsLibraryDock={effectsLibraryDock}
            onActiveInsertKindChange={onActiveInsertKindChange}
          />
        </div>
        <VideoEditorFloatingWorkspacePanel />
      </div>
    </div>
  );
}
