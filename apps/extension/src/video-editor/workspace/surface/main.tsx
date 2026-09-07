import { WorkspaceTrackPresentation } from './track-presentation';
import { AudioRecordingModal } from '../../recording/audio-modal';
import { VideoEditorLibraryPanel } from '../../library/panel';
import { useVideoEditorMediaLibrary } from '../../runtime/controller/libraries';
import React, { useState } from 'react';
import { VideoProjectStorageStatus } from '../floating/storage-status';
import { VideoEditorFloatingInspectorStack } from '../floating/inspector-stack';
import {
  InspectorGroupFocusContext,
  type InspectorGroupFocusIntent,
} from '../sidebar/selection/grouped-inspector';
import { useActiveCanvasInsertEscape } from '@sniptale/ui/canvas-tools';
import {
  useVideoEditorHeaderController,
  useVideoEditorLayoutController,
  useVideoEditorSidebarController,
} from '../../runtime/controller/composition/hooks';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorWorkspaceCanvas } from './canvas';
import { useWorkspaceEffectBundles } from './effect-bundles';
import { useEffectLibraryOperations } from '../../library/effects-dock/operations';
import { useWorkspacePanelSizes } from '../floating/panel-layout';

interface VideoEditorWorkspaceMainProps {
  previewHeightStyle: React.CSSProperties;
}

/**
 * Renders the interactive workspace body after overlay state is resolved.
 */
export function VideoEditorWorkspaceMain({
  previewHeightStyle,
}: VideoEditorWorkspaceMainProps): React.JSX.Element {
  const [activeInsertKind, setActiveInsertKind] = useState<VideoPreviewCanvasInsertKind | null>(
    null
  );
  const { effectsLibraryDockOpen, materialsOpen, changeEffectsOpen, toggleMaterials, inspector } =
    useWorkspacePanels();
  const [inspectorGroupFocus] = useState<InspectorGroupFocusIntent | null>(null);
  const effectBundles = useWorkspaceEffectBundles();
  const effectOperations = useEffectLibraryOperations();
  const panelSizes = useWorkspacePanelSizes(materialsOpen || effectsLibraryDockOpen);
  const [materialsFullHeight, setMaterialsFullHeight] = useState(false);
  const [inspectorFullHeight, setInspectorFullHeight] = useState(false);
  const workspaceStyle: React.CSSProperties & { '--video-editor-inspector-width': string } = {
    '--video-editor-inspector-width': `${panelSizes.inspector.width}px`,
  };
  useActiveCanvasInsertEscape({
    active: activeInsertKind !== null,
    onCancel: () => setActiveInsertKind(null),
  });

  return (
    <InspectorGroupFocusContext.Provider value={inspectorGroupFocus}>
      <div
        className="relative flex min-h-0 min-w-[1280px] flex-1 flex-col overflow-hidden"
        style={workspaceStyle}
        ref={panelSizes.containerRef}
      >
        <WorkspaceTrackPresentation>
          <VideoProjectStorageStatus />
          <VideoEditorWorkspaceCanvas
            inspectorPanel={inspector}
            onMaterialsOpenChange={toggleMaterials}
            inspectorFullHeight={inspectorFullHeight}
            materialsPanel={{
              resize: panelSizes.materials,
              fullHeight: materialsFullHeight,
              onToggle: () => setMaterialsFullHeight((current) => !current),
            }}
            materialsOpen={materialsOpen}
            inspector={
              <VideoEditorFloatingInspectorStack
                onClose={inspector.onToggle}
                resize={panelSizes.inspector}
                fullHeight={inspectorFullHeight}
                onToggleFullHeight={() => setInspectorFullHeight((current) => !current)}
              />
            }
            activeInsertKind={activeInsertKind}
            effectBundles={effectBundles}
            effectOperations={effectOperations}
            effectsLibraryDockOpen={effectsLibraryDockOpen}
            previewHeightStyle={previewHeightStyle}
            onClearActiveInsertKind={() => setActiveInsertKind(null)}
            onEffectsLibraryDockOpenChange={changeEffectsOpen}
          />
          <VideoEditorWorkspaceOverlays />
        </WorkspaceTrackPresentation>
      </div>
    </InspectorGroupFocusContext.Provider>
  );
}

function useWorkspacePanels() {
  const header = useVideoEditorHeaderController();
  const [activeLibrary, setActiveLibrary] = useState<'materials' | 'effects' | null>('materials');
  const effectsLibraryDockOpen = activeLibrary === 'effects';
  const materialsOpen = activeLibrary === 'materials';
  const changeEffectsOpen = (open: boolean) => {
    setActiveLibrary(open ? 'effects' : null);
    focusWorkspaceButton(
      open ? 'video-editor.library-tab.effects' : 'video-editor.viewer.open-materials'
    );
  };
  return {
    effectsLibraryDockOpen,
    materialsOpen,
    changeEffectsOpen,
    toggleMaterials: (open: boolean) => {
      setActiveLibrary(open ? 'materials' : null);
      focusWorkspaceButton(
        open ? 'video-editor.library-tab.materials' : 'video-editor.viewer.open-materials'
      );
    },
    inspector: {
      isOpen: Boolean(header && !header.leftSidebarCollapsed),
      onToggle: () => {
        header?.onToggleSidebar();
        focusWorkspaceButton(
          header?.leftSidebarCollapsed
            ? 'video-editor.inspector.close'
            : 'video-editor.viewer.open-inspector'
        );
      },
    },
  };
}

function VideoEditorWorkspaceOverlays(): React.JSX.Element {
  return (
    <>
      <VideoEditorWorkspaceLibraryPanel />
      <VideoEditorAudioRecordingModal />
    </>
  );
}

function VideoEditorWorkspaceLibraryPanel(): React.JSX.Element | null {
  const header = useVideoEditorHeaderController();
  const sidebar = useVideoEditorSidebarController();
  const media = useVideoEditorMediaLibrary(header?.libraryPanelOpen ?? false);
  if (!header || !sidebar) return null;
  return (
    <VideoEditorLibraryPanel
      isOpen={header.libraryPanelOpen}
      items={media.items}
      savedViews={media.savedViews}
      loading={media.loading}
      error={media.error}
      onRefresh={media.refresh}
      onAddMedia={sidebar.projectActions.onAddLibraryMedia}
      onClose={header.onCloseLibraryPanel}
    />
  );
}

function VideoEditorAudioRecordingModal(): React.JSX.Element | null {
  const layout = useVideoEditorLayoutController();
  const sidebar = useVideoEditorSidebarController();
  if (!sidebar) return null;
  return (
    <AudioRecordingModal
      isOpen={layout.audioRecordingDialogOpen}
      onClose={layout.closeAudioRecordingDialog}
      onSave={(file, trim) =>
        sidebar.projectActions.onImportRecordedAudio(file, trim, layout.audioRecordingTarget)
      }
    />
  );
}

function focusWorkspaceButton(dataUi: string) {
  requestAnimationFrame(() =>
    document.querySelector<HTMLButtonElement>(`[data-ui="${dataUi}"]`)?.focus()
  );
}
