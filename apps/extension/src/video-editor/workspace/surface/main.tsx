import { AudioRecordingModal } from '../../recording/audio-modal';
import { VideoEditorLibraryPanel } from '../../library/panel';
import React, { useState } from 'react';
import { VideoEditorFloatingWorkspace } from '../floating';
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
  const [effectsLibraryDockOpen, setEffectsLibraryDockOpen] = useState(true);
  const [inspectorGroupFocus] = useState<InspectorGroupFocusIntent | null>(null);
  const effectBundles = useWorkspaceEffectBundles();
  const effectOperations = useEffectLibraryOperations();
  useActiveCanvasInsertEscape({
    active: activeInsertKind !== null,
    onCancel: () => setActiveInsertKind(null),
  });

  return (
    <InspectorGroupFocusContext.Provider value={inspectorGroupFocus}>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <VideoEditorWorkspaceCanvas
          activeInsertKind={activeInsertKind}
          effectBundles={effectBundles}
          effectOperations={effectOperations}
          effectsLibraryDockOpen={effectsLibraryDockOpen}
          previewHeightStyle={previewHeightStyle}
          onClearActiveInsertKind={() => setActiveInsertKind(null)}
          onEffectsLibraryDockOpenChange={setEffectsLibraryDockOpen}
        />
        <VideoEditorWorkspaceOverlays
          activeInsertKind={activeInsertKind}
          diagnosticsContent={diagnosticsContent}
          effectsLibraryDockOpen={effectsLibraryDockOpen}
          onActiveInsertKindChange={setActiveInsertKind}
          onEffectsLibraryDockOpenChange={setEffectsLibraryDockOpen}
        />
      </div>
    </InspectorGroupFocusContext.Provider>
  );
}

function VideoEditorWorkspaceOverlays(props: {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  diagnosticsContent: React.ReactNode;
  effectsLibraryDockOpen: boolean;
  onActiveInsertKindChange: (insertKind: VideoPreviewCanvasInsertKind | null) => void;
  onEffectsLibraryDockOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
}): React.JSX.Element {
  return (
    <>
      <VideoEditorFloatingWorkspace
        activeInsertKind={props.activeInsertKind}
        diagnosticsContent={props.diagnosticsContent}
        effectsLibraryDock={{
          isOpen: props.effectsLibraryDockOpen,
          onToggle: () => props.onEffectsLibraryDockOpenChange((value) => !value),
        }}
        onActiveInsertKindChange={props.onActiveInsertKindChange}
      />
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
