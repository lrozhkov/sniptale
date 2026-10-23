import type { QuickEditHomography } from './motion/spatial-geometry';
import type { VisualLayerSourcePointMapping } from './draw/fitted-media';
import type { QuickEditBorder, QuickEditSpotlight } from '../project/scene/focus-appearance';
import type { SceneBorderClock } from './scene-border';
import type { CameraSpatialFrame, CameraSpatialRect } from '../project/motion/spatial';
import type { VideoProjectActionOccurrence } from '../project/action-occurrences';
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
  VideoProjectActionPreset,
  VideoProjectAnnotationClip,
  VideoProjectCursorTrack,
  VideoProjectEffectClip,
  VideoProjectImageClip,
  VideoProjectMotionRegion,
  VideoProjectShapeClip,
  VideoProjectTextStyle,
  VideoProjectTransitionSegment,
  VideoProjectVideoClip,
  VideoProjectTrackRole,
} from '../project/types/index';
import type { EffectRuntimeFramePlan } from './effect-runtime/runtime/types';

interface VideoCompositionLayerBase<TClip, TKind extends string> {
  /** Already composed in viewport coordinates by a track/global FX stage. */
  effectViewportRaster?: boolean;
  effectActionsOnly?: boolean;
  /** Source-scene utility projection also paints its deferred border after the scene mask. */
  deferSourceBorders?: boolean;
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

/** Disposable authored appearance and retained phase clock, before output geometry is known. */
export interface VideoCompositionBorderState {
  coordinateSpace?: 'source-window';
  id: string;
  border: QuickEditBorder;
  clock: SceneBorderClock;
}

/** Evaluated Native source phase; an optional concrete clip anchors scene-wide coverage. */
export interface VideoCompositionSpotlightState {
  /** Source-scene masks run after this authored layer, before later layers. */
  afterClipId?: string;
  /** Split appearances of one authored focus share a single Native transition mask pass. */
  sourceTransition?: { id: string; leadingClipId: string; trailingClipId: string; blend?: true };
  coordinateSpace?: 'source-window';
  id: string;
  spotlight: QuickEditSpotlight;
  phase: 'enter' | 'hold' | 'exit';
  progress: number;
  from?: QuickEditSpotlight;
  clipId?: string;
}

export type VideoCompositionVisualLayer =
  | (VideoCompositionLayerBase<VideoProjectVideoClip, 'video'> & {
      /** Role of the source track, retained for independent camera composition. */
      trackRole?: VideoProjectTrackRole;
      /** Inner source exposure remains inside the decorated window mask. */
      sourceContentTransform?: QuickEditHomography;
      actions?: readonly VideoCompositionActionState[];
      /** Window borders enter clip FX once; source-scene utility borders follow their scene mask. */
      borders?: readonly VideoCompositionBorderState[];
      /** Window masks operate on isolated source pixels before clip/track effects. */
      spotlights?: readonly VideoCompositionSpotlightState[];
    })
  | VideoCompositionLayerBase<VideoProjectImageClip, 'image'>
  | VideoCompositionLayerBase<VideoCompositionResolvedTextClip, 'text'>
  | VideoCompositionLayerBase<VideoCompositionResolvedAnnotationClip, 'annotation'>
  | (VideoCompositionLayerBase<VideoProjectEffectClip, 'effect'> & {
      /** Disposable source geometry; the host still owns body geometry and animation timing. */
      sourceAttachment?: {
        owner: Extract<VideoCompositionVisualLayer, { kind: 'video' }>;
        mapping: Omit<VisualLayerSourcePointMapping, 'point'>;
        innerTransform?: QuickEditHomography;
      };
    })
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
  gestureFeedback?: import('../review/click-animation').ReviewClickFrame;
  clickStyle?: import('../project/types').VideoActionClickStyle;
  keyStyle?: import('../project/types').VideoActionKeyStyle;
  /** Absent for legacy project-pixel keys. Captured captions declare their authored viewport width. */
  keyStyleViewportWidth?: number;
  easing?: import('../project/types').VideoTemporalEasing;
  preset: VideoProjectActionPreset;
  occurrence: VideoProjectActionOccurrence;
  clipId: string | null;
  renderKind: 'accent' | 'keystroke' | null;
  duration: number;
  event: VideoProjectActionEvent;
  point: VideoProjectActionEvent['point'];
  progress: number;
  start: number;
}

export interface VideoCompositionCameraState {
  /** A source-window camera leaves all other visual layers outside its exposure passes. */
  sourceClipId?: string;
  /** Inner source motion in the clip plane, before outer window projection. */
  sourceContentTransform?: QuickEditHomography;
  /** Following paint uses the source exposure without moving independent clips. */
  backgroundCamera?: { scale: number; viewportX: number; viewportY: number };
  /** Disposable pose and absolute project-plane reference, never persisted. */
  spatial?: CameraSpatialFrame & {
    reference: CameraSpatialRect;
    /** The bound media affine placement; local perspective/depth remain in the original plane. */
    planeTransform?: QuickEditHomography;
  };
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
  sceneSpotlights?: readonly VideoCompositionSpotlightState[];
  /** Viewport-normalized borders stay independent of the project camera. */
  viewportBorders?: readonly VideoCompositionBorderState[];
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

export interface VideoCompositionMotionSegment {
  end: number;
  id: string;
  region: VideoProjectMotionRegion;
  start: number;
}
