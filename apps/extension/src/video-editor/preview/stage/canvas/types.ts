import type React from 'react';

import type { PreviewStageCanvasProps } from '../types';

export type PreviewStageCanvasLayerProps = Pick<
  PreviewStageCanvasProps,
  | 'activeClips'
  | 'audioBankClips'
  | 'audioRefs'
  | 'assetUrls'
  | 'cachedVideo'
  | 'currentTime'
  | 'isPlaying'
  | 'project'
  | 'videoBankClips'
  | 'videoRefs'
> & {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gpuHostRef?: React.RefObject<HTMLDivElement | null> | undefined;
};

export type PreviewStageRootSurfaceProps = Pick<
  PreviewStageCanvasProps,
  | 'activeClips'
  | 'activeInsertKind'
  | 'audioBankClips'
  | 'audioRefs'
  | 'assetUrls'
  | 'beginInteraction'
  | 'camera'
  | 'cameraInteractionEnabled'
  | 'canRenderCursorFrame'
  | 'cachedVideo'
  | 'currentTime'
  | 'effectRuntimeFeedback'
  | 'onCameraPresented'
  | 'registerPlaybackRequest'
  | 'grid'
  | 'guides'
  | 'mode'
  | 'isPlaying'
  | 'onAddShapeOverlay'
  | 'onAddTextOverlay'
  | 'onClearActiveInsertKind'
  | 'onClearPlacementMode'
  | 'onGuideChange'
  | 'onSelectClip'
  | 'onUpdateClipTransform'
  | 'onUpdateAnnotationClipTemplate'
  | 'onUpdateActionEventDetails'
  | 'onUpdateMotionRegion'
  | 'onPreviewMotion'
  | 'motionProject'
  | 'onUpsertObjectTrackCorrectionAnchor'
  | 'placementMode'
  | 'previewCacheBypass'
  | 'previewExactFrameCache'
  | 'previewMode'
  | 'previewRenderer'
  | 'previewRasterSize'
  | 'project'
  | 'effectPreparationProject'
  | 'renderGenerationRef'
  | 'selectedActionOccurrence'
  | 'selectedClipId'
  | 'selectedMotionRegion'
  | 'stageRef'
  | 'stageSizeStyle'
  | 'videoBankClips'
  | 'videoRefs'
> & {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gpuHostRef?: React.RefObject<HTMLDivElement | null> | undefined;
  selectionOverlay: React.ReactNode;
  targetOverlay: React.ReactNode;
};

export type PreviewStageRootProps = Omit<PreviewStageRootSurfaceProps, 'canvasRef' | 'gpuHostRef'>;
