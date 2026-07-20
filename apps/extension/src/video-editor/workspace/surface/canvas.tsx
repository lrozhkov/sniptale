import type React from 'react';
import { ProjectTimeline } from '../../timeline/project';
import { PreviewStage } from '../../preview/stage';
import type { VideoEditorWorkspaceController } from '../../runtime/controller/contracts/workspace';
import type { VideoPreviewCanvasInsertKind } from '../../preview/stage/types';
import { VideoEditorWorkspaceEffectsLibrary } from './effects-library';
import type { WorkspaceEffectBundlesState } from './effect-bundles';
import { getProjectTimelineProps } from './timeline-props';
import type { VideoEditorEffectDocumentDragPayload } from '../../contracts/effect-document-drag';
import type { VideoProjectEffectTarget } from '../../../features/video/project/effect-instance/types';
import type { EffectLibraryOperations } from '../../library/effects-dock/operations';
import type { VideoEditorEffectCatalogItem } from '../../library/effects-dock/types';

export function VideoEditorWorkspaceCanvas(props: VideoEditorWorkspaceCanvasProps) {
  return (
    <div
      data-ui="video-editor.workspace.canvas-shell"
      className={getWorkspaceCanvasShellClassName(props.controller.header.leftSidebarCollapsed)}
    >
      <div
        ref={props.controller.layout.workspaceSplitRef}
        className="flex h-full min-h-0 flex-col gap-0"
      >
        <div className="flex min-h-0 shrink-0 gap-3" style={props.previewHeightStyle}>
          <VideoEditorWorkspaceEffectsLibrary
            controller={props.controller}
            effectBundles={props.effectBundles}
            effectOperations={props.effectOperations}
            isOpen={props.effectsLibraryDockOpen}
            onOpenChange={props.onEffectsLibraryDockOpenChange}
          />
          <VideoEditorWorkspacePreview {...props} />
        </div>
        <VideoEditorWorkspaceResizeHandle
          onPointerDown={props.controller.layout.handleStartVerticalResize}
        />
        <VideoEditorWorkspaceTimeline {...props} />
      </div>
    </div>
  );
}

interface VideoEditorWorkspaceCanvasProps {
  activeInsertKind: VideoPreviewCanvasInsertKind | null;
  controller: VideoEditorWorkspaceController;
  effectBundles: WorkspaceEffectBundlesState;
  effectOperations: EffectLibraryOperations;
  effectsLibraryDockOpen: boolean;
  previewHeightStyle: React.CSSProperties;
  onClearActiveInsertKind: () => void;
  onEffectsLibraryDockOpenChange: (open: boolean) => void;
}

function VideoEditorWorkspacePreview(props: VideoEditorWorkspaceCanvasProps): React.JSX.Element {
  return (
    <div className="min-h-0 min-w-0 flex-1">
      <PreviewStage {...createWorkspacePreviewProps(props)} />
    </div>
  );
}

function createWorkspacePreviewProps(
  props: VideoEditorWorkspaceCanvasProps
): React.ComponentProps<typeof PreviewStage> {
  const preview = props.controller.preview;
  return {
    activeInsertKind: props.activeInsertKind,
    assetUrls: preview.assetUrls,
    currentTime: preview.transport.currentTime,
    grid: preview.grid,
    isPlaying: preview.transport.isPlaying,
    playbackRange: preview.transport.playbackRange,
    placementMode: preview.selection.placementMode,
    project: preview.project,
    previewMode: preview.preferences.mode,
    previewPreferencesSaveFailed: preview.preferences.saveFailed,
    previewRasterPreset: preview.preferences.rasterPreset,
    previewZoom: preview.preferences.zoom,
    registerPreviewRuntime: preview.transport.registerPreviewRuntime,
    selectedActionEvent: preview.selection.selectedActionEvent,
    selectedClipId: preview.selection.selectedClipId,
    selectedMotionRegion: preview.selection.selectedMotionRegion,
    onClearActiveInsertKind: props.onClearActiveInsertKind,
    ...preview.editing,
    onImport: preview.onImport,
    ...createWorkspacePreviewActions(preview),
  };
}

function createWorkspacePreviewActions(
  preview: VideoEditorWorkspaceController['preview']
): Pick<
  React.ComponentProps<typeof PreviewStage>,
  | 'onClearPlacementMode'
  | 'onPausePlayback'
  | 'onPreviewModeChange'
  | 'onPreviewPreferencesRetry'
  | 'onPreviewRasterPresetChange'
  | 'onPreviewZoomChange'
  | 'onSeek'
  | 'onSelectClip'
  | 'onSelectScene'
  | 'onTogglePlay'
  | 'onUpdateActionEventDetails'
  | 'onUpdateMotionRegion'
  | 'onUpsertObjectTrackCorrectionAnchor'
> {
  return {
    onClearPlacementMode: preview.pointAuthoring.onClearPlacementMode,
    onPausePlayback: preview.transport.onPausePlayback,
    onPreviewModeChange: preview.preferences.onModeChange,
    onPreviewPreferencesRetry: preview.preferences.onRetrySave,
    onPreviewRasterPresetChange: preview.preferences.onRasterPresetChange,
    onPreviewZoomChange: preview.preferences.onZoomChange,
    onSeek: preview.transport.onSeek,
    onSelectClip: preview.selection.onSelectClip,
    onSelectScene: preview.selection.onSelectScene,
    onTogglePlay: preview.transport.onTogglePlay,
    onUpdateActionEventDetails: preview.pointAuthoring.onUpdateActionEventDetails,
    onUpdateMotionRegion: preview.pointAuthoring.onUpdateMotionRegion,
    onUpsertObjectTrackCorrectionAnchor: preview.pointAuthoring.onUpsertObjectTrackCorrectionAnchor,
  };
}

function VideoEditorWorkspaceTimeline(props: VideoEditorWorkspaceCanvasProps): React.JSX.Element {
  return (
    <div className="min-h-[220px] min-w-0 flex-1">
      <ProjectTimeline
        {...getProjectTimelineProps(
          props.controller,
          (payload, target, startTime) =>
            void applyDroppedEffectDocument({
              catalogs: props.effectBundles.catalogs,
              onApplyEffectDocument: props.controller.sidebar.projectActions.onApplyEffectDocument,
              operations: props.effectOperations,
              payload,
              startTime,
              target,
            })
        )}
      />
    </div>
  );
}

interface ApplyDroppedEffectDocumentArgs {
  catalogs: readonly VideoEditorEffectCatalogItem[];
  onApplyEffectDocument: VideoEditorWorkspaceController['sidebar']['projectActions']['onApplyEffectDocument'];
  operations: EffectLibraryOperations;
  payload: VideoEditorEffectDocumentDragPayload;
  startTime: number;
  target: VideoProjectEffectTarget;
}

export async function applyDroppedEffectDocument(
  args: ApplyDroppedEffectDocumentArgs
): Promise<void> {
  const item = args.catalogs.find(
    (candidate) =>
      candidate.status === 'ready' &&
      candidate.catalog.enabled &&
      candidate.catalog.packId === args.payload.packId
  );
  const catalog = item?.status === 'ready' ? item.catalog : null;
  const document = catalog?.documents.find(
    ({ id, kind }) => id === args.payload.documentId && kind === args.payload.kind
  );
  if (!catalog || !document || !doesEffectKindMatchTarget(document.kind, args.target)) return;
  await args.operations.run('apply', () =>
    args.onApplyEffectDocument({
      catalog,
      documentId: document.id,
      startTime: args.startTime,
      target: args.target,
    })
  );
}

function doesEffectKindMatchTarget(
  kind: VideoEditorEffectDocumentDragPayload['kind'],
  target: VideoProjectEffectTarget
): boolean {
  return (
    (kind === 'standalone' && target.kind === 'scene') ||
    (kind === 'targetEffect' && target.kind === 'clip') ||
    (kind === 'transition' && target.kind === 'transition')
  );
}

function VideoEditorWorkspaceResizeHandle({
  onPointerDown,
}: {
  onPointerDown: React.PointerEventHandler<HTMLDivElement>;
}): React.JSX.Element {
  return (
    <div
      data-ui="video-editor.workspace.timeline-resize-zone"
      role="separator"
      aria-orientation="horizontal"
      onPointerDown={onPointerDown}
      className="h-2 shrink-0 cursor-row-resize"
    />
  );
}

function getWorkspaceCanvasShellClassName(inspectorCollapsed: boolean): string {
  return [
    'min-h-0 min-w-0 flex-1 p-3 pt-[4.75rem]',
    inspectorCollapsed ? 'pr-3' : 'pr-[21.75rem] max-[1120px]:pr-3',
    'max-[860px]:pt-[11.75rem]',
  ].join(' ');
}
