import type { VideoCursorDetectionFrame } from './types';
import { resolveStaticPenalty } from './detector-guards';
import { clamp01 } from './pixels';

interface CursorScoreParams {
  minComponentArea: number;
}

interface ScoredCursorComponent {
  area: number;
  darkEdgePixels: number;
  lumaMode: 'bright' | 'dark';
  maxX: number;
  minX: number;
  minY: number;
}

export function resolveComponentScores(
  frame: VideoCursorDetectionFrame,
  component: ScoredCursorComponent,
  width: number,
  height: number,
  params: CursorScoreParams
): { confidence: number; contrastScore: number; shapeScore: number; staticPenalty: number } {
  const areaScore = clamp01(component.area / Math.max(params.minComponentArea * 4, 1));
  const edgeScore = clamp01(component.darkEdgePixels / Math.max(component.area, 1));
  const aspectRatio = width / Math.max(height, 1);
  const aspectScore = aspectRatio >= 0.25 && aspectRatio <= 2.5 ? 1 : 0.35;
  const fillRatio = component.area / Math.max(width * height, 1);
  const sparseShapeScore = clamp01(1.18 - Math.abs(fillRatio - 0.42) * 1.35);
  const contrastScore = clamp01(0.12 + areaScore * 0.34 + edgeScore * 0.38 + aspectScore * 0.16);
  const shapeScore = clamp01(
    areaScore * 0.22 + edgeScore * 0.28 + aspectScore * 0.14 + sparseShapeScore * 0.36
  );
  const staticPenalty = resolveStaticPenalty(frame, component, width, height);
  const polarityPenalty = component.lumaMode === 'dark' ? 0.86 : 1;
  return {
    confidence: clamp01(
      (contrastScore * 0.56 + shapeScore * 0.44) * staticPenalty * polarityPenalty
    ),
    contrastScore,
    shapeScore,
    staticPenalty,
  };
}
