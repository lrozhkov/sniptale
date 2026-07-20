import type { PointLike } from '../../types';

export interface PolylineLengthState {
  distances: number[];
  total: number;
}

export interface PolylineSample {
  normal: PointLike;
  point: PointLike;
}

export interface ResolvedPolylineSegment {
  end: PointLike;
  next: PointLike;
  previous: PointLike;
  ratio: number;
  start: PointLike;
}

export interface PolylineFrame extends PolylineSample {
  tangent: PointLike;
}
