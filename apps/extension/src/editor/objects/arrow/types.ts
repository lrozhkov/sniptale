import type { EditorArrowSettings } from '../../../features/editor/document/types';

export interface PointLike {
  x: number;
  y: number;
}

export interface ArrowObjectOptions {
  id: string;
  labelIndex: number;
  settings: EditorArrowSettings;
  points?: PointLike[];
  start?: PointLike;
  end?: PointLike;
  control?: PointLike | null;
  label?: string;
}

export interface ArrowCurveSegment {
  control1: PointLike;
  control2: PointLike;
  end: PointLike;
}
