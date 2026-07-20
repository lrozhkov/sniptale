import { normalizeEditorArrowHeadSize } from '../../../../features/editor/document/arrow';
import type { PointLike } from '../types';

const HEAD_SIZE_MULTIPLIER = 3.4;
const DIAMOND_HEAD_SIZE_MULTIPLIER = 2.35;
const EXCALIDRAW_ARROW_HEAD_ANGLE_DEGREES = 20;
const POLYGON_HEAD_ANGLE_DEGREES = 25;
const OPEN_HEAD_LENGTH_MULTIPLIER = 3.4;
const BAR_HEAD_LENGTH_MULTIPLIER = 1.1;

type HeadMetrics = {
  depth: number;
  half: number;
};

function getArrowHeadScale(size?: number): number {
  return normalizeEditorArrowHeadSize(size);
}

function getStandardArrowHeadSize(width: number, size?: number): number {
  return Math.max(10, width * HEAD_SIZE_MULTIPLIER) * getArrowHeadScale(size);
}

export function getTriangleArrowHeadDepth(width: number, size?: number): number {
  return getAngledHeadMetrics(getStandardArrowHeadSize(width, size), POLYGON_HEAD_ANGLE_DEGREES)
    .depth;
}

export function getDiamondArrowHeadJoinDepth(width: number, size?: number): number {
  return getAngledHeadMetrics(getDiamondArrowHeadSize(width, size), POLYGON_HEAD_ANGLE_DEGREES)
    .depth;
}

export function getCircleArrowHeadRadius(width: number, size?: number): number {
  return Math.max(5, getStandardArrowHeadSize(width, size) / 3);
}

export function getOpenArrowHeadLength(width: number, size?: number): number {
  return Math.max(24, width * OPEN_HEAD_LENGTH_MULTIPLIER) * getArrowHeadScale(size);
}

export function getOpenArrowHeadDepth(width: number, size?: number): number {
  return getAngledHeadMetrics(
    getOpenArrowHeadLength(width, size),
    EXCALIDRAW_ARROW_HEAD_ANGLE_DEGREES
  ).depth;
}

export function getBarArrowHeadLength(width: number, size?: number): number {
  return Math.max(4, width * BAR_HEAD_LENGTH_MULTIPLIER) * getArrowHeadScale(size);
}

export function buildTriangleVertices(width: number, size?: number): PointLike[] {
  return [
    { x: 0, y: 0 },
    ...buildExcalidrawArrowheadArmEnds(getStandardArrowHeadSize(width, size), {
      angleDegrees: POLYGON_HEAD_ANGLE_DEGREES,
    }),
  ];
}

export function buildDiamondVertices(width: number, size?: number): PointLike[] {
  const headSize = getDiamondArrowHeadSize(width, size);
  const metrics = getAngledHeadMetrics(headSize, POLYGON_HEAD_ANGLE_DEGREES);
  return [
    { x: 0, y: 0 },
    { x: -metrics.depth, y: metrics.half },
    { x: -metrics.depth * 2, y: 0 },
    { x: -metrics.depth, y: -metrics.half },
  ];
}

export function buildExcalidrawArrowheadArmEnds(
  size: number,
  options: { angleDegrees?: number } = {}
): [PointLike, PointLike] {
  const metrics = getAngledHeadMetrics(
    size,
    options.angleDegrees ?? EXCALIDRAW_ARROW_HEAD_ANGLE_DEGREES
  );
  return [
    { x: -metrics.depth, y: metrics.half },
    { x: -metrics.depth, y: -metrics.half },
  ];
}

function getAngledHeadMetrics(length: number, angleDegrees: number): HeadMetrics {
  const angle = (angleDegrees * Math.PI) / 180;
  return {
    depth: Math.cos(angle) * length,
    half: Math.sin(angle) * length,
  };
}

function getDiamondArrowHeadSize(width: number, size?: number): number {
  return Math.max(10, width * DIAMOND_HEAD_SIZE_MULTIPLIER) * getArrowHeadScale(size);
}
