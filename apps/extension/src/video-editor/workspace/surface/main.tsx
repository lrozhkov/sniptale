import { EffectDocumentDragProvider } from '../../chrome/effect-document-drag';
import { InspectorSectionMemoryProvider } from '../sidebar/selection/grouped-inspector/presentation';
import { useWorkspacePreference } from '../../runtime/controller/workspace-preferences';
import {
  RuntimePlaybackContext,
  WorkspacePlaybackRangeContext,
} from '../../runtime/controller/composition/contexts';
import {
  useVideoEditorPlaybackPort,
  getCurrentVideoEditorProjectSnapshot,
} from '../../runtime/controller/store';
import { isAudioRecordingRangeAvailable } from '../../project/operations/timeline-gaps';
import { WorkspaceTrackPresentation } from './track-presentation';
import { AudioRecordingModal } from '../../recording/audio-modal';
import { VideoEditorLibraryPanel } from '../../library/panel';
import { useVideoEditorMediaLibrary } from '../../runtime/controller/libraries';
import React, { useState, useContext, useRef, useEffect, useMemo } from 'react';
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
  const {
    effectsLibraryDockOpen,
    effectKind,
    materialsOpen,
    changeEffectsOpen,
    toggleMaterials,
    inspector,
  } = useWorkspacePanels();
  const [inspectorGroupFocus] = useState<InspectorGroupFocusIntent | null>(null);
  const effectBundles = useWorkspaceEffectBundles();
  const effectOperations = useEffectLibraryOperations();
  const panelSizes = useWorkspacePanelSizes(materialsOpen || effectsLibraryDockOpen);
  const [materialsFullHeight, setMaterialsFullHeight] =
    useWorkspacePreference('materialsFullHeight');
  const [inspectorFullHeight, setInspectorFullHeight] =
    useWorkspacePreference('inspectorFullHeight');
  const workspaceStyle: React.CSSProperties & { '--video-editor-inspector-width': string } = {
    '--video-editor-inspector-width': `${panelSizes.inspector.width}px`,
  };
  useActiveCanvasInsertEscape({
    active: activeInsertKind !== null,
    onCancel: () => setActiveInsertKind(null),
  });

  return (
    <InspectorSectionMemoryProvider>
      <InspectorGroupFocusContext.Provider value={inspectorGroupFocus}>
        <div
          className="relative flex min-h-0 min-w-[1280px] flex-1 flex-col overflow-hidden"
          style={workspaceStyle}
          ref={panelSizes.containerRef}
        >
          <EffectDocumentDragProvider>
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
                effectKind={effectKind}
                previewHeightStyle={previewHeightStyle}
                onClearActiveInsertKind={() => setActiveInsertKind(null)}
                onEffectsLibraryDockOpenChange={changeEffectsOpen}
              />
              <VideoEditorWorkspaceOverlays />
            </WorkspaceTrackPresentation>
          </EffectDocumentDragProvider>
        </div>
      </InspectorGroupFocusContext.Provider>
    </InspectorSectionMemoryProvider>
  );
}

function useWorkspacePanels() {
  const header = useVideoEditorHeaderController();
  const [activeLibrary, setActiveLibrary] = useWorkspacePreference('activeLibrary');
  const effectsLibraryDockOpen = activeLibrary !== null && activeLibrary !== 'materials';
  const effectKind =
    activeLibrary === 'annotations'
      ? 'standalone'
      : activeLibrary === 'transitions'
        ? 'transition'
        : 'targetEffect';
  const materialsOpen = activeLibrary === 'materials';
  const changeEffectsOpen = (
    open: boolean,
    kind: 'standalone' | 'targetEffect' | 'transition' = 'targetEffect'
  ) => {
    const section =
      kind === 'standalone' ? 'annotations' : kind === 'transition' ? 'transitions' : 'effects';
    setActiveLibrary(open ? section : null);
    focusWorkspaceButton(
      open ? `video-editor.library-tab.${section}` : 'video-editor.viewer.open-materials'
    );
  };
  return {
    effectsLibraryDockOpen,
    effectKind: effectKind as 'standalone' | 'targetEffect' | 'transition',
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
  const runtime = useContext(RuntimePlaybackContext);
  const ranges = useContext(WorkspacePlaybackRangeContext);
  const setCurrentTime = useVideoEditorPlaybackPort((port) => port.setCurrentTime);
  const current = useRef({ open: layout.audioRecordingDialogOpen });
  current.current = { open: layout.audioRecordingDialogOpen };
  const target = layout.audioRecordingTarget;
  const runtimeRef = useRef(runtime);
  runtimeRef.current = runtime;
  const rangesRef = useRef(ranges);
  rangesRef.current = ranges;
  useEffect(() => {
    if (!layout.audioRecordingDialogOpen || !runtimeRef.current) return;
    const runtime = runtimeRef.current;
    const ranges = rangesRef.current;
    const previousRange = ranges?.playbackRange ?? null;
    runtime.pausePlayback();
    if (target) {
      ranges?.setPlaybackRange({ start: target.startTime, end: target.endTime, loop: false });
      runtime.seekTo(target.startTime);
    }
    return () => {
      runtimeRef.current?.pausePlayback();
      if (target) rangesRef.current?.setPlaybackRange(previousRange);
    };
  }, [layout.audioRecordingDialogOpen, target]);
  const timeline = useMemo(
    () =>
      target && runtime
        ? {
            startTime: target.startTime,
            duration: target.endTime - target.startTime,
            beforeStart: async () => {
              const project = getCurrentVideoEditorProjectSnapshot();
              if (
                !project ||
                project.id !== target.projectId ||
                !isAudioRecordingRangeAvailable(
                  project,
                  target.trackId,
                  target.startTime,
                  target.endTime
                )
              )
                throw new Error('Recording destination unavailable');
              runtime.pausePlayback();
              setCurrentTime(target.startTime);
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
              if (!current.current.open) throw new Error('Recording cancelled');
              const started = await runtime.setPlaybackPlaying(true);
              if (started === false || !current.current.open)
                throw new Error('Playback unavailable');
            },
            onStop: () => {
              runtime.pausePlayback();
            },
          }
        : undefined,
    [target, runtime, setCurrentTime]
  );
  if (!sidebar) return null;
  return (
    <AudioRecordingModal
      timeline={timeline}
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
