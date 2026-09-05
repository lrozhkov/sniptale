import { AudioRecordingModal } from '../../recording/audio-modal';
import { VideoEditorLibraryPanel } from '../../library/panel';
import React, { useRef, useState } from 'react';
import { VideoEditorFloatingWorkspace } from '../floating';
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
import { useInspectorResize } from '../floating/inspector-resize';

interface VideoEditorWorkspaceMainProps {
  diagnosticsContent: React.ReactNode;
  previewHeightStyle: React.CSSProperties;
}

/**
 * Renders the interactive workspace body after overlay state is resolved.
 */
export function VideoEditorWorkspaceMain({
  diagnosticsContent,
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
  const inspectorResize = useInspectorResize();
  const [inspectorFullHeight, setInspectorFullHeight] = useState(false);
  const workspaceStyle: React.CSSProperties & { '--video-editor-inspector-width': string } = {
    '--video-editor-inspector-width': `${inspectorResize.width}px`,
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
      >
        <VideoEditorFloatingWorkspace
          inspector={inspector}
          materials={{ isOpen: materialsOpen, onToggle: toggleMaterials }}
          activeInsertKind={activeInsertKind}
          effectsLibraryDock={{
            isOpen: effectsLibraryDockOpen,
            onToggle: () => changeEffectsOpen(!effectsLibraryDockOpen),
          }}
          onActiveInsertKindChange={setActiveInsertKind}
        />
        <VideoEditorWorkspaceCanvas
          inspectorFullHeight={inspectorFullHeight}
          materialsOpen={materialsOpen}
          inspector={
            <VideoEditorFloatingInspectorStack
              diagnosticsContent={diagnosticsContent}
              resize={inspectorResize}
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
        <VideoEditorWorkspaceOverlays diagnosticsContent={diagnosticsContent} />
      </div>
    </InspectorGroupFocusContext.Provider>
  );
}

function useWorkspacePanels() {
  const header = useVideoEditorHeaderController();
  const [activeLibrary, setActiveLibrary] = useState<'materials' | 'effects' | null>('materials');
  const effectsLibraryDockOpen = activeLibrary === 'effects';
  const materialsOpen = activeLibrary === 'materials';
  const libraryBeforeEffects = useRef<'materials' | null>(null);
  const changeEffectsOpen = (open: boolean) => {
    if (open) {
      libraryBeforeEffects.current = activeLibrary === 'materials' ? 'materials' : null;
      setActiveLibrary('effects');
    } else {
      setActiveLibrary(libraryBeforeEffects.current);
    }
  };
  return {
    effectsLibraryDockOpen,
    materialsOpen,
    changeEffectsOpen,
    toggleMaterials: () => setActiveLibrary(materialsOpen ? null : 'materials'),
    inspector: {
      isOpen: Boolean(header && !header.leftSidebarCollapsed),
      onToggle: () => header?.onToggleSidebar(),
    },
  };
}

function VideoEditorWorkspaceOverlays(props: {
  diagnosticsContent: React.ReactNode;
}): React.JSX.Element {
  return (
    <>
      <VideoEditorWorkspaceLibraryPanel diagnosticsContent={props.diagnosticsContent} />
      <VideoEditorAudioRecordingModal diagnosticsContent={props.diagnosticsContent} />
    </>
  );
}

function VideoEditorWorkspaceLibraryPanel({
  diagnosticsContent,
}: Pick<VideoEditorWorkspaceMainProps, 'diagnosticsContent'>): React.JSX.Element | null {
  const header = useVideoEditorHeaderController();
  const sidebar = useVideoEditorSidebarController(diagnosticsContent);
  if (!header || !sidebar) return null;
  return (
    <VideoEditorLibraryPanel
      activeProjectId={sidebar.state.activeProjectId}
      diagnosticsContent={sidebar.state.diagnosticsContent}
      diagnosticsOpen={sidebar.state.diagnosticsOpen}
      isOpen={header.libraryPanelOpen}
      onAddRecording={sidebar.projectActions.onAddRecording}
      onClose={header.onCloseLibraryPanel}
      onCreateProject={sidebar.projectActions.onCreateProject}
      onDeleteProject={sidebar.projectActions.onDeleteProject}
      onImportAudio={sidebar.projectActions.onImportAudio}
      onImportImage={sidebar.projectActions.onImportImage}
      onOpenAudioRecordingDialog={header.onOpenAudioRecordingDialog}
      onImportVideo={sidebar.projectActions.onImportVideo}
      onOpenProject={sidebar.projectActions.onOpenProject}
      onToggleDiagnostics={sidebar.projectActions.onToggleDiagnostics}
      projects={sidebar.state.projects}
      recordingId={sidebar.state.recordingId}
      recordings={sidebar.state.recordings}
    />
  );
}

function VideoEditorAudioRecordingModal({
  diagnosticsContent,
}: Pick<VideoEditorWorkspaceMainProps, 'diagnosticsContent'>): React.JSX.Element | null {
  const layout = useVideoEditorLayoutController();
  const sidebar = useVideoEditorSidebarController(diagnosticsContent);
  if (!sidebar) return null;
  return (
    <AudioRecordingModal
      isOpen={layout.audioRecordingDialogOpen}
      onClose={layout.closeAudioRecordingDialog}
      onSave={sidebar.projectActions.onImportRecordedAudio}
    />
  );
}
