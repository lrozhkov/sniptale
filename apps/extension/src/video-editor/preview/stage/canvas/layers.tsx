import type React from 'react';

import { handleStageAreaPlacement, PreviewStageMotionAreaOverlay } from '../area-overlay/index';
import { PreviewStageCanvasBanks } from '../media/banks';

import { PreviewStagePointOverlay, handleStagePointPlacement } from '../point-overlay/index';
import { handleStagePointerDown } from './selection-overlay';
import type { PreviewStageCanvasProps } from '../types';
import type { PreviewStageCanvasLayerProps } from './types';
import { PreviewStageCachedVideo } from '../media/cached-video';

const PREVIEW_STAGE_FRAME_CLASS_NAME =
  'absolute inset-0 flex items-center justify-center overflow-hidden';

export function PreviewStageFrame({ children }: { children: React.ReactNode }) {
  return <div className={PREVIEW_STAGE_FRAME_CLASS_NAME}>{children}</div>;
}

export function PreviewStageCanvasLayer(params: PreviewStageCanvasLayerProps): React.ReactNode {
  return (
    <>
      <canvas
        ref={params.canvasRef}
        data-preview-stage-canvas
        style={{ backgroundColor: '#000' }}
        className="absolute inset-0 h-full w-full"
      />
      <PreviewStageCachedVideo
        currentTime={params.currentTime}
        isPlaying={params.isPlaying}
        source={params.cachedVideo}
      />
      <PreviewStageCanvasBanks
        audioBankClips={params.audioBankClips}
        audioRefs={params.audioRefs}
        assetUrls={params.assetUrls}
        project={params.project}
        videoBankClips={params.videoBankClips}
        videoRefs={params.videoRefs}
      />
    </>
  );
}

export function handlePreviewStageRootPointerDown(
  event: React.PointerEvent<HTMLDivElement>,
  params: Pick<
    PreviewStageCanvasProps,
    | 'currentTime'
    | 'activeClips'
    | 'beginInteraction'
    | 'camera'
    | 'grid'
    | 'guides'
    | 'mode'
    | 'onClearPlacementMode'
    | 'onSelectClip'
    | 'onUpdateActionEventDetails'
    | 'onUpdateMotionRegion'
    | 'onUpsertObjectTrackCorrectionAnchor'
    | 'placementMode'
    | 'project'
    | 'selectedActionOccurrence'
    | 'selectedMotionRegion'
    | 'stageRef'
  >
): void {
  if (params.mode === 'player') {
    return;
  }

  if (handleStageAreaPlacement(event, params)) {
    return;
  }

  if (handleStagePointPlacement(event, params)) {
    return;
  }

  handleStagePointerDown(event, params);
}

export function PreviewStageOverlayLayer(
  params: Pick<
    PreviewStageCanvasProps,
    | 'camera'
    | 'grid'
    | 'mode'
    | 'currentTime'
    | 'onClearPlacementMode'
    | 'onGuideChange'
    | 'onUpdateAnnotationClipTemplate'
    | 'onUpdateActionEventDetails'
    | 'onUpdateMotionRegion'
    | 'onUpsertObjectTrackCorrectionAnchor'
    | 'placementMode'
    | 'project'
    | 'selectedActionOccurrence'
    | 'selectedMotionRegion'
    | 'stageRef'
  > & {
    selectionOverlay: React.ReactNode;
    targetOverlay: React.ReactNode;
  }
) {
  if (params.mode === 'player') {
    return null;
  }

  return (
    <>
      {params.selectionOverlay}
      {params.targetOverlay}
      <PreviewStageInteractiveOverlays {...params} />
    </>
  );
}

function PreviewStageInteractiveOverlays(params: Parameters<typeof PreviewStageOverlayLayer>[0]) {
  const gridProps = params.grid ? { grid: params.grid } : {};
  const guideProps = params.onGuideChange ? { onGuideChange: params.onGuideChange } : {};

  return (
    <>
      <PreviewStageMotionAreaOverlay
        camera={params.camera}
        onClearPlacementMode={params.onClearPlacementMode}
        onUpdateMotionRegion={params.onUpdateMotionRegion}
        placementMode={params.placementMode}
        project={params.project}
        selectedMotionRegion={params.selectedMotionRegion}
        stageRef={params.stageRef}
        {...gridProps}
        {...guideProps}
      />
      <PreviewStagePointOverlay
        camera={params.camera}
        currentTime={params.currentTime}
        onClearPlacementMode={params.onClearPlacementMode}
        onUpdateActionEventDetails={params.onUpdateActionEventDetails}
        onUpdateMotionRegion={params.onUpdateMotionRegion}
        {...(params.onUpsertObjectTrackCorrectionAnchor
          ? { onUpsertObjectTrackCorrectionAnchor: params.onUpsertObjectTrackCorrectionAnchor }
          : {})}
        placementMode={params.placementMode}
        project={params.project}
        selectedActionOccurrence={params.selectedActionOccurrence}
        selectedMotionRegion={params.selectedMotionRegion}
        stageRef={params.stageRef}
        {...gridProps}
        {...guideProps}
      />
    </>
  );
}
