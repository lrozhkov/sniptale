import type { EditorArrowHead } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { buildBarArrowHeadPath } from './heads-builders/bar';
import { buildBlockArrowHeadPath } from './heads-builders/block';
import { buildOpenArrowHeadPath } from './heads-builders/open';
import { buildStandardArrowHeadPath } from './heads-builders/standard';
import {
  buildDiamondVertices,
  buildTriangleVertices,
  getBarArrowHeadLength,
  getCircleArrowHeadRadius,
  getDiamondArrowHeadJoinDepth,
  getOpenArrowHeadDepth,
  getTriangleArrowHeadDepth,
} from './heads-metrics';
import { rotatePoint, translatePoint } from './points';

function getHeadAttachmentOverlap(width: number): number {
  return Math.min(3, Math.max(1, width * 0.08));
}

export function getArrowHeadAttachmentInset(
  type: EditorArrowHead,
  width: number,
  size?: number
): number {
  const overlap = getHeadAttachmentOverlap(width);
  switch (type) {
    case 'triangle-outline':
    case 'triangle':
      return Math.max(0, getTriangleArrowHeadDepth(width, size) - overlap);
    case 'diamond-outline':
    case 'diamond':
      return Math.max(0, getDiamondArrowHeadJoinDepth(width, size) - overlap);
    case 'arrow':
    case 'open':
      return Math.max(0, getOpenArrowHeadDepth(width, size) - overlap);
    case 'bar':
      return getBarArrowHeadLength(width, size) * 0.5;
    case 'block':
      return Math.max(0, getTriangleArrowHeadDepth(width, size) - overlap);
    case 'circle-outline':
      return Math.max(0, getCircleArrowHeadRadius(width, size) - overlap);
    case 'crosshair-circle':
    case 'circle':
    case 'none':
      return 0;
  }
}

export function buildArrowHeadPath(
  type: EditorArrowHead,
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  switch (type) {
    case 'triangle':
    case 'triangle-outline':
    case 'diamond':
    case 'diamond-outline':
    case 'circle':
    case 'circle-outline':
    case 'crosshair-circle':
      return buildStandardArrowHeadPath(type, point, angleRad, width, size);
    case 'arrow':
    case 'open':
      return buildOpenArrowHeadPath(point, angleRad, width, size);
    case 'bar':
      return buildBarArrowHeadPath(point, angleRad, width, size);
    case 'block':
      return buildBlockArrowHeadPath(point, angleRad, width, size);
    case 'none':
      return '';
  }
}

export function buildArrowHeadStrokePath(
  type: EditorArrowHead,
  point: PointLike,
  angleRad: number,
  width: number,
  size?: number
): string {
  switch (type) {
    case 'triangle':
    case 'triangle-outline':
    case 'block':
      return verticesToStrokePath(buildTriangleVertices(width, size), point, angleRad, false);
    case 'diamond':
    case 'diamond-outline':
      return verticesToStrokePath(buildDiamondVertices(width, size), point, angleRad, true);
    case 'arrow':
    case 'open':
      return verticesToStrokePath(buildTriangleVertices(width, size), point, angleRad, false);
    case 'bar':
    case 'circle':
    case 'circle-outline':
    case 'crosshair-circle':
      return buildArrowHeadPath(type, point, angleRad, width, size);
    case 'none':
      return '';
  }
}

function verticesToStrokePath(
  vertices: readonly PointLike[],
  point: PointLike,
  angleRad: number,
  closed: boolean
): string {
  const oriented = vertices.map((vertex) => translatePoint(rotatePoint(vertex, angleRad), point));
  const first = oriented[0];
  if (!first) {
    return '';
  }

  const tail = oriented.slice(1).map((vertex) => `L ${vertex.x} ${vertex.y}`);
  return [`M ${first.x} ${first.y}`, ...tail, closed ? 'Z' : ''].filter(Boolean).join(' ');
}
