import type { NormalizedTimelineKeyframe, NormalizedTimelineTrack } from '../model/types.js';

export const MOTION_PATH_POINT_KINDS = ['corner', 'linear', 'smooth'] as const;

export type MotionPathPointKind = (typeof MOTION_PATH_POINT_KINDS)[number];

export interface MotionPathTangent {
  x: number;
  y: number;
}

export interface TimelineMotionPathPoint {
  inTangent: MotionPathTangent;
  kind: MotionPathPointKind;
  outTangent: MotionPathTangent;
  xKeyframeId: string;
  yKeyframeId: string;
}

export interface TimelineMotionPath {
  layerId: string;
  points: TimelineMotionPathPoint[];
}

export interface ResolvedMotionPathPoint extends TimelineMotionPathPoint {
  time: number;
  x: number;
  xKeyframe: NormalizedTimelineKeyframe;
  y: number;
  yKeyframe: NormalizedTimelineKeyframe;
}

export type MotionPathGeometryResult =
  | {
      layerId: string;
      ok: true;
      points: ResolvedMotionPathPoint[];
      xTrack: NormalizedTimelineTrack;
      yTrack: NormalizedTimelineTrack;
    }
  | {
      layerId: string;
      ok: false;
      reason:
        | 'duplicate-time'
        | 'missing-keyframe'
        | 'missing-path'
        | 'missing-track'
        | 'non-numeric'
        | 'temporal-mismatch'
        | 'time-mismatch';
    };
