import type { ResolvedAnnotationPresentation } from '../project/annotation/template';
import type { ResolvedAnnotationScene } from '../project/annotation-engine';
import type {
  VideoProjectAnnotationCalloutDecor,
  VideoProjectAnnotationLeaderLine,
  VideoProjectAnnotationTargetPoint,
  VideoProjectAnnotationTargetRect,
} from '../project/types/layout';
import type {
  VideoAnnotationRenderFamily,
  VideoAnnotationTargetKind,
  VideoOverlayTemplateKind,
} from '../project/types/templates';
import type {
  ResolvedTransitionOverlay,
  ResolvedTransitionVisualState,
} from '../project/transition/presentation';
import type {
  VideoMotionOverlayZoomMode,
  VideoProjectActionEvent,
  VideoProjectAnnotationClip,
  VideoProjectCursorTrack,
  VideoProjectEffectClip,
  VideoProjectImageClip,
  VideoProjectMotionRegion,
  VideoProjectShapeClip,
  VideoProjectTextStyle,
  VideoProjectTransitionSegment,
  VideoProjectVideoClip,
} from '../project/types/index';
import type { EffectRuntimeFramePlan } from './effect-runtime/runtime/types';

interface VideoCompositionLayerBase<TClip, TKind extends string> {
  clip: TClip;
  clipId: string;
  kind: TKind;
  opacity: number;
  renderState: ResolvedTransitionVisualState;
  rotation: number;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
}

export interface VideoCompositionResolvedTextClip {
  id: string;
  text: string;
  trackId: string;
  type: 'TEXT' | 'SUBTITLE';
  style: VideoProjectTextStyle;
}

export interface VideoCompositionResolvedAnnotationClip {
  calloutDecor: VideoProjectAnnotationCalloutDecor;
  content: VideoProjectAnnotationClip['content'];
  id: string;
  leaderLine: VideoProjectAnnotationLeaderLine;
  presentation: ResolvedAnnotationPresentation;
  renderFamily: VideoAnnotationRenderFamily;
  scene?: ResolvedAnnotationScene | undefined;
  target: VideoAnnotationTargetKind;
  targetPoint: VideoProjectAnnotationTargetPoint | null;
  targetRect: VideoProjectAnnotationTargetRect | null;
  templateKind: VideoOverlayTemplateKind;
  trackId: string;
}

export type VideoCompositionVisualLayer =
  | VideoCompositionLayerBase<VideoProjectVideoClip, 'video'>
  | VideoCompositionLayerBase<VideoProjectImageClip, 'image'>
  | VideoCompositionLayerBase<VideoCompositionResolvedTextClip, 'text'>
  | VideoCompositionLayerBase<VideoCompositionResolvedAnnotationClip, 'annotation'>
  | VideoCompositionLayerBase<VideoProjectEffectClip, 'effect'>
  | VideoCompositionLayerBase<VideoProjectShapeClip, 'shape'>;

export interface VideoCompositionCursorState {
  animationPreset: VideoProjectCursorTrack['skin']['animationPreset'];
  captureMode: VideoProjectCursorTrack['captureMode'];
  color: string;
  preset: VideoProjectCursorTrack['skin']['preset'];
  scale: number;
  shadow: boolean;
  time: number;
  visible: boolean;
  x: number;
  y: number;
}

export interface VideoCompositionActionState {
  duration: number;
  event: VideoProjectActionEvent;
  point: VideoProjectActionEvent['point'];
  progress: number;
  start: number;
}

export interface VideoCompositionCameraState {
  focusPoint: { x: number; y: number };
  motionBlurAmount: number;
  overlayZoomMode?: VideoMotionOverlayZoomMode;
  regionId: string | null;
  scale: number;
  viewportHeight: number;
  viewportWidth: number;
  viewportX: number;
  viewportY: number;
}

export interface VideoCompositionFrame {
  actions: VideoCompositionActionState[];
  camera: VideoCompositionCameraState;
  cursor: VideoCompositionCursorState | null;
  effectInputLayers: VideoCompositionVisualLayer[];
  effectRuntimePlans: EffectRuntimeFramePlan[];
  visualLayers: VideoCompositionVisualLayer[];
}

export interface VideoCompositionVisualPass {
  alpha: number;
  frame: VideoCompositionFrame;
  time: number;
  transitionOverlays: ResolvedTransitionOverlay[];
}

export type VideoCompositionTransitionSegment = VideoProjectTransitionSegment;

export interface VideoCompositionCursorSegment {
  end: number;
  id: string;
  sampleIds: string[];
  start: number;
  visible: boolean;
}

export interface VideoCompositionActionSegment {
  end: number;
  event: VideoProjectActionEvent;
  id: string;
  point: VideoProjectActionEvent['point'];
  start: number;
}

export interface VideoCompositionMotionSegment {
  end: number;
  id: string;
  region: VideoProjectMotionRegion;
  start: number;
}
