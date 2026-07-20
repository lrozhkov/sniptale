import { AudioRecordingModal } from '../../recording/audio-modal';
import { VideoEditorLibraryPanel } from '../../library/panel';
import React, { useState } from 'react';
import { VideoEditorFloatingWorkspace } from '../floating';
import {
  InspectorGroupFocusContext,
  type InspectorGroupFocusIntent,
} from '../sidebar/selection/grouped-inspector';
import { useActiveCanvasInsertEscape } from '@sniptale/ui/canvas-tools';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorWorkspaceCanvas } from './canvas';
import { useWorkspaceEffectBundles } from './effect-bundles';
import { useEffectLibraryOperations } from '../../library/effects-dock/operations';

interface VideoEditorWorkspaceMainProps {
  controller: VideoEditorWorkspaceController;
  previewHeightStyle: React.CSSProperties;
}

/**
 * Renders the interactive workspace body after overlay state is resolved.
 */
export function VideoEditorWorkspaceMain({
  controller,
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
          controller={controller}
          effectBundles={effectBundles}
          effectOperations={effectOperations}
          effectsLibraryDockOpen={effectsLibraryDockOpen}
          previewHeightStyle={previewHeightStyle}
          onClearActiveInsertKind={() => setActiveInsertKind(null)}
          onEffectsLibraryDockOpenChange={setEffectsLibraryDockOpen}
        />
        <VideoEditorWorkspaceOverlays
          activeInsertKind={activeInsertKind}
          controller={controller}
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
  controller: VideoEditorWorkspaceController;
  effectsLibraryDockOpen: boolean;
  onActiveInsertKindChange: (insertKind: VideoPreviewCanvasInsertKind | null) => void;
  onEffectsLibraryDockOpenChange: (open: boolean | ((open: boolean) => boolean)) => void;
}): React.JSX.Element {
  return (
    <>
      <VideoEditorFloatingWorkspace
        activeInsertKind={props.activeInsertKind}
        controller={props.controller}
        effectsLibraryDock={{
          isOpen: props.effectsLibraryDockOpen,
          onToggle: () => props.onEffectsLibraryDockOpenChange((value) => !value),
        }}
        onActiveInsertKindChange={props.onActiveInsertKindChange}
      />
      <VideoEditorWorkspaceLibraryPanel controller={props.controller} />
      <AudioRecordingModal
        isOpen={props.controller.layout.audioRecordingDialogOpen}
        onClose={props.controller.layout.closeAudioRecordingDialog}
        onSave={props.controller.sidebar.projectActions.onImportRecordedAudio}
      />
    </>
  );
}

function VideoEditorWorkspaceLibraryPanel({
  controller,
}: Pick<VideoEditorWorkspaceMainProps, 'controller'>): React.JSX.Element {
  return (
    <VideoEditorLibraryPanel
      activeProjectId={controller.sidebar.state.activeProjectId}
      diagnosticsContent={controller.sidebar.state.diagnosticsContent}
      diagnosticsOpen={controller.sidebar.state.diagnosticsOpen}
      isOpen={controller.header.libraryPanelOpen}
      onAddRecording={controller.sidebar.projectActions.onAddRecording}
      onClose={controller.header.onCloseLibraryPanel}
      onCreateProject={controller.sidebar.projectActions.onCreateProject}
      onDeleteProject={controller.sidebar.projectActions.onDeleteProject}
      onImportAudio={controller.sidebar.projectActions.onImportAudio}
      onImportImage={controller.sidebar.projectActions.onImportImage}
      onOpenAudioRecordingDialog={controller.header.onOpenAudioRecordingDialog}
      onImportVideo={controller.sidebar.projectActions.onImportVideo}
      onOpenProject={controller.sidebar.projectActions.onOpenProject}
      onToggleDiagnostics={controller.sidebar.projectActions.onToggleDiagnostics}
      projects={controller.sidebar.state.projects}
      recordingId={controller.sidebar.state.recordingId}
      recordings={controller.sidebar.state.recordings}
    />
  );
}
