import type {
  VideoProjectAnnotationCalloutDecor,
  VideoProjectAnnotationLeaderLine,
  VideoProjectAnnotationStyle,
  VideoProjectAnnotationTargetPoint,
  VideoProjectAnnotationTargetRect,
} from './layout';
import type {
  VideoAnnotationFamily,
  VideoAnnotationMotionFamily,
  VideoAnnotationRenderFamily,
  VideoAnnotationTargetKind,
  VideoOverlayAnimationKind,
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
  VideoTemplateIntensity,
} from './templates';
import type {
  VideoAnnotationTemplateControlValues,
  VideoAnnotationTemplateRef,
  VideoAnnotationTemplateSnapshot,
} from '../annotation-engine/types';

export interface VideoProjectAnnotationContent {
  badge: string | null;
  headline: string;
  subline: string;
}

export interface VideoProjectAnnotationFields {
  annotationFamily: VideoAnnotationFamily;
  calloutDecor: VideoProjectAnnotationCalloutDecor;
  content: VideoProjectAnnotationContent;
  direction: VideoTemplateDirection;
  intensity: VideoTemplateIntensity;
  introAnimation: VideoOverlayAnimationKind;
  introDurationMs: number;
  leaderLine: VideoProjectAnnotationLeaderLine;
  motionFamily: VideoAnnotationMotionFamily;
  outroAnimation: VideoOverlayAnimationKind;
  outroDurationMs: number;
  renderFamily: VideoAnnotationRenderFamily;
  style: VideoProjectAnnotationStyle;
  target: VideoAnnotationTargetKind;
  targetPoint: VideoProjectAnnotationTargetPoint | null;
  targetRect: VideoProjectAnnotationTargetRect | null;
  /** Stable declarative template reference used by the annotation-engine rollout path. */
  templateRef?: VideoAnnotationTemplateRef | undefined;
  /** Resolved control values captured on the clip so pack updates do not rewrite old projects. */
  templateControlValues?: VideoAnnotationTemplateControlValues | undefined;
  /** Optional snapshot for fail-soft reads when a custom pack or template disappears later. */
  templateSnapshot?: VideoAnnotationTemplateSnapshot | undefined;
  templateKind: VideoOverlayTemplateKind;
}
