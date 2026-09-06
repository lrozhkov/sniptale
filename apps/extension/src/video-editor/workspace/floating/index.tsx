import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
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
    <div data-ui="video-editor.floating-workspace" className="shrink-0 px-3 py-2">
      <VideoEditorFloatingDocumentBar {...(inspector ? { inspector } : {})}>
        {materials && (
          <ContentToolbarButton
            className="!w-auto gap-2 !px-2"
            title={translate('videoEditor.app.materialsTitle')}
            active={materials.isOpen}
            aria-pressed={materials.isOpen}
            onClick={materials.onToggle}
          >
            <FolderOpen size={17} aria-hidden="true" />
            {translate('videoEditor.app.materialsTitle')}
          </ContentToolbarButton>
        )}
        <VideoEditorFloatingInsertPanel
          activeInsertKind={activeInsertKind}
          effectsLibraryDock={effectsLibraryDock}
          onActiveInsertKindChange={onActiveInsertKindChange}
        />
        <VideoEditorFloatingWorkspacePanel />
      </VideoEditorFloatingDocumentBar>
    </div>
  );
}
