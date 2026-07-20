import React from 'react';
import { CanvasInsertPreviewOverlay } from '@sniptale/ui/canvas-tools';
import { PreviewStageAnnotationTargetOverlay } from '../annotation-target-overlay/index';
import { usePreviewStageImageBank } from '../media/video-bank';
import { usePreviewStageCanvasScene } from '../scene/index';
import { PreviewStageSelectionOverlay } from './selection-overlay';
import {
  type PreviewStageInsertPreviewFrame,
  type PreviewStageInsertSessionParams,
  usePreviewStageInsertSession,
} from './insert-session';
import { PreviewStageGridOverlay, PreviewStageGuideOverlay } from './grid-overlay';
import { getCompositionRectStageStyle } from './geometry';
import type { PreviewStageCanvasProps } from '../types';
import { PreviewStageCanvasLayer, PreviewStageOverlayLayer } from './layers';
import type { PreviewStageRootProps, PreviewStageRootSurfaceProps } from './types';

export function PreviewStageRootSurface(params: PreviewStageRootSurfaceProps) {
  const gridProps = params.grid ? { grid: params.grid } : {};
  const onGuideChange = params.onGuideChange ?? (() => undefined);
  const { insertPointerHandlers, insertPreviewFrame } = usePreviewStageInsertSession(
    createPreviewStageInsertSessionParams(params)
  );

  return (
    <div
      ref={params.stageRef as React.RefObject<HTMLDivElement>}
      data-ui="video.preview.stage.root"
      className="relative m-auto shrink-0 overflow-hidden bg-[color:var(--sniptale-color-surface-panel)]"
      style={params.stageSizeStyle}
      onPointerDownCapture={insertPointerHandlers.onPointerDownCapture}
      onPointerDown={insertPointerHandlers.onPointerDown}
      onKeyDown={insertPointerHandlers.onKeyDown}
      onPointerMove={insertPointerHandlers.onPointerMove}
      onPointerUp={insertPointerHandlers.onPointerUp}
      onPointerCancel={insertPointerHandlers.cancel}
      tabIndex={0}
    >
      <PreviewStageRootMediaLayer params={params} />
      <PreviewStageRootOverlayLayer
        gridProps={gridProps}
        onGuideChange={onGuideChange}
        params={params}
      />
      <PreviewStageGuideOverlay guides={params.guides ?? []} project={params.project} />
      <PreviewStageInsertPreviewOverlay
        camera={params.camera}
        frame={insertPreviewFrame}
        project={params.project}
        stageRef={params.stageRef}
      />
    </div>
  );
}

function createPreviewStageInsertSessionParams(
  params: PreviewStageRootSurfaceProps
): PreviewStageInsertSessionParams {
  return {
    activeInsertKind: params.activeInsertKind,
    camera: params.camera,
    fallbackPointerParams: createPreviewStageInsertFallbackPointerParams(params),
    onAddShapeOverlay: params.onAddShapeOverlay,
    onAddTextOverlay: params.onAddTextOverlay,
    onClearActiveInsertKind: params.onClearActiveInsertKind,
    onSelectClip: params.onSelectClip,
    onUpdateClipTransform: params.onUpdateClipTransform,
    project: params.project,
    stageRef: params.stageRef,
  };
}

function createPreviewStageInsertFallbackPointerParams(
  params: PreviewStageRootSurfaceProps
): PreviewStageInsertSessionParams['fallbackPointerParams'] {
  return {
    activeClips: params.activeClips,
    beginInteraction: params.beginInteraction,
    camera: params.camera,
    currentTime: params.currentTime,
    mode: params.mode,
    onClearPlacementMode: params.onClearPlacementMode,
    onSelectClip: params.onSelectClip,
    onUpdateActionEventDetails: params.onUpdateActionEventDetails,
    onUpdateMotionRegion: params.onUpdateMotionRegion,
    placementMode: params.placementMode,
    project: params.project,
    selectedActionEvent: params.selectedActionEvent,
    selectedMotionRegion: params.selectedMotionRegion,
    stageRef: params.stageRef,
    ...(params.grid ? { grid: params.grid } : {}),
    ...(params.guides ? { guides: params.guides } : {}),
    ...(params.onUpsertObjectTrackCorrectionAnchor
      ? { onUpsertObjectTrackCorrectionAnchor: params.onUpsertObjectTrackCorrectionAnchor }
      : {}),
  };
}

function PreviewStageRootMediaLayer(props: { params: PreviewStageRootSurfaceProps }) {
  const { params } = props;
  return (
    <PreviewStageCanvasLayer
      activeClips={params.activeClips}
      audioBankClips={params.audioBankClips}
      audioRefs={params.audioRefs}
      assetUrls={params.assetUrls}
      cachedVideo={params.cachedVideo}
      canvasRef={params.canvasRef}
      currentTime={params.currentTime}
      isPlaying={params.isPlaying}
      project={params.project}
      videoBankClips={params.videoBankClips}
      videoRefs={params.videoRefs}
    />
  );
}

function PreviewStageRootOverlayLayer(props: {
  gridProps: Pick<PreviewStageRootSurfaceProps, 'grid'> | Record<string, never>;
  onGuideChange: NonNullable<PreviewStageRootSurfaceProps['onGuideChange']>;
  params: PreviewStageRootSurfaceProps;
}) {
  const { gridProps, onGuideChange, params } = props;
  return (
    <>
      <PreviewStageGridOverlay project={params.project} {...gridProps} />
      <PreviewStageOverlayLayer
        camera={params.camera}
        currentTime={params.currentTime}
        mode={params.mode}
        onClearPlacementMode={params.onClearPlacementMode}
        onUpdateAnnotationClipTemplate={params.onUpdateAnnotationClipTemplate}
        onUpdateActionEventDetails={params.onUpdateActionEventDetails}
        onUpdateMotionRegion={params.onUpdateMotionRegion}
        onUpsertObjectTrackCorrectionAnchor={params.onUpsertObjectTrackCorrectionAnchor}
        placementMode={params.placementMode}
        project={params.project}
        onGuideChange={onGuideChange}
        selectionOverlay={params.selectionOverlay}
        selectedActionEvent={params.selectedActionEvent}
        targetOverlay={params.targetOverlay}
        selectedMotionRegion={params.selectedMotionRegion}
        stageRef={params.stageRef}
        {...gridProps}
      />
    </>
  );
}

function PreviewStageInsertPreviewOverlay(params: {
  camera: PreviewStageCanvasProps['camera'];
  frame: PreviewStageInsertPreviewFrame | null;
  project: PreviewStageCanvasProps['project'];
  stageRef: PreviewStageCanvasProps['stageRef'];
}) {
  const stage = params.stageRef.current;
  if (!stage || !params.frame || params.frame.width < 2 || params.frame.height < 2) {
    return null;
  }

  return (
    <CanvasInsertPreviewOverlay
      dataUi="video-editor.preview.insert-preview"
      frame={params.frame}
      style={getCompositionRectStageStyle(params.project, params.frame, params.camera, true, stage)}
    />
  );
}

export function PreviewStageRoot(params: PreviewStageRootProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageBank = usePreviewStageImageBank(params.project, params.activeClips, params.assetUrls);

  usePreviewStageCanvasScene({
    activeClips: params.activeClips,
    canvasRef,
    currentTime: params.currentTime,
    effectRuntimeFeedback: params.effectRuntimeFeedback,
    imageBank,
    isPlaying: params.isPlaying,
    previewCacheBypass: params.previewCacheBypass,
    previewExactFrameCache: params.previewExactFrameCache,
    previewRasterSize: params.previewRasterSize,
    previewMode: params.previewMode,
    project: params.project,
    renderGeneration: params.renderGenerationRef?.current ?? 0,
    stageRef: params.stageRef,
    videoRefs: params.videoRefs,
  });

  return <PreviewStageRootSurface {...params} canvasRef={canvasRef} />;
}

export function createPreviewStageSelectionOverlay(
  params: Pick<
    PreviewStageCanvasProps,
    | 'beginInteraction'
    | 'camera'
    | 'mode'
    | 'project'
    | 'selectedClip'
    | 'selectedClipLocked'
    | 'stageRef'
  >
): React.ReactNode {
  if (params.mode === 'player') {
    return null;
  }

  return (
    <PreviewStageSelectionOverlay
      beginInteraction={params.beginInteraction}
      camera={params.camera}
      project={params.project}
      selectedClip={params.selectedClip}
      selectedClipLocked={params.selectedClipLocked}
      stageRef={params.stageRef}
    />
  );
}

export function createPreviewStageAnnotationTargetOverlay(
  params: Pick<
    PreviewStageCanvasProps,
    | 'camera'
    | 'mode'
    | 'onUpdateAnnotationClipTemplate'
    | 'project'
    | 'selectedClip'
    | 'selectedClipLocked'
    | 'stageRef'
  >
): React.ReactNode {
  if (params.mode === 'player') {
    return null;
  }

  return (
    <PreviewStageAnnotationTargetOverlay
      camera={params.camera}
      onUpdateAnnotationClipTemplate={params.onUpdateAnnotationClipTemplate}
      project={params.project}
      selectedClip={params.selectedClip}
      selectedClipLocked={params.selectedClipLocked}
      stageRef={params.stageRef}
    />
  );
}
