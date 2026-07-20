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
  | 'cachedVideo'
  | 'currentTime'
  | 'effectRuntimeFeedback'
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
  | 'onUpsertObjectTrackCorrectionAnchor'
  | 'placementMode'
  | 'previewCacheBypass'
  | 'previewExactFrameCache'
  | 'previewMode'
  | 'previewRasterSize'
  | 'project'
  | 'renderGenerationRef'
  | 'selectedActionEvent'
  | 'selectedClipId'
  | 'selectedMotionRegion'
  | 'stageRef'
  | 'stageSizeStyle'
  | 'videoBankClips'
  | 'videoRefs'
> & {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  selectionOverlay: React.ReactNode;
  targetOverlay: React.ReactNode;
};

export type PreviewStageRootProps = Omit<PreviewStageRootSurfaceProps, 'canvasRef'>;
