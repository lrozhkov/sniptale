import type { ResolvedAnnotationEffects } from '../annotation/effects';
import type {
  VideoProjectAnnotationClip,
  VideoProjectAnnotationStyle,
  VideoProjectAnnotationTargetPoint,
  VideoProjectAnnotationTargetRect,
} from '../types/index';
import type {
  VideoAnnotationPrimitiveValue,
  VideoAnnotationRenderNodeKind,
  VideoAnnotationTargetBindingKind,
  VideoAnnotationTimelinePhase,
} from './types';

export interface ResolvedAnnotationFrame {
  height: number;
  opacity: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
}

export interface ResolvedAnnotationTransform {
  blurPx: number;
  rotation: number;
  scale: number;
  x: number;
  y: number;
}

export interface ResolvedAnnotationTarget {
  binding: VideoAnnotationTargetBindingKind;
  normalizedPoint: VideoProjectAnnotationTargetPoint | null;
  normalizedRect: VideoProjectAnnotationTargetRect | null;
  point: VideoProjectAnnotationTargetPoint | null;
  rect: VideoProjectAnnotationTargetRect | null;
}

export interface ResolvedAnnotationRenderNode {
  children: readonly ResolvedAnnotationRenderNode[];
  frame: ResolvedAnnotationFrame;
  id: string;
  nodeType: VideoAnnotationRenderNodeKind;
  opacity: number;
  order: number;
  props: Record<string, VideoAnnotationPrimitiveValue>;
  style: Record<string, VideoAnnotationPrimitiveValue>;
  transform: ResolvedAnnotationTransform;
}

export interface ResolvedAnnotationTimelineTrackState {
  id: string;
  progress: number;
  property: string;
  targetNodeId: string;
  value: VideoAnnotationPrimitiveValue;
}

export interface ResolvedAnnotationTimelineState {
  effects: readonly ResolvedAnnotationTimelineTrackState[];
  localTimeMs: number;
  phase: VideoAnnotationTimelinePhase | 'after' | 'before' | 'hold';
  phaseProgress: number;
}

export interface ResolvedAnnotationPresentationSnapshot {
  effects: ResolvedAnnotationEffects;
  frame: ResolvedAnnotationFrame;
  labelFrame: Omit<ResolvedAnnotationFrame, 'opacity' | 'rotation'>;
  style: VideoProjectAnnotationStyle;
}

export interface ResolvedAnnotationScene {
  clipId: string;
  effects: ResolvedAnnotationEffects;
  frame: ResolvedAnnotationFrame;
  nodes: readonly ResolvedAnnotationRenderNode[];
  presentation: ResolvedAnnotationPresentationSnapshot;
  renderTree: ResolvedAnnotationRenderNode;
  target: ResolvedAnnotationTarget;
  timeline: ResolvedAnnotationTimelineState;
}

export interface AnnotationSceneTargetGeometry {
  point?: VideoProjectAnnotationTargetPoint | null | undefined;
  rect?: VideoProjectAnnotationTargetRect | null | undefined;
}

export type AnnotationSceneResolvableClip = Pick<
  VideoProjectAnnotationClip,
  | 'content'
  | 'id'
  | 'startTime'
  | 'targetPoint'
  | 'targetRect'
  | 'templateControlValues'
  | 'templateSnapshot'
>;
