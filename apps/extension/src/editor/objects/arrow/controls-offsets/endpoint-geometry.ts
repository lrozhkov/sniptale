import { type EditorArrowSettings } from '../../../../features/editor/document/types';
import type { PointLike } from '../types';
import { getArrowEndpointIndex } from './keys';

const ARROW_ENDPOINT_HANDLE_OFFSET_MIN = 6;
const ARROW_ENDPOINT_HANDLE_OFFSET_WIDTH_MULTIPLIER = 1;
const DEFAULT_ARROW_DIRECTION = { x: 1, y: 0 };

function getEndpointHandleOffsetDistance(settings: EditorArrowSettings): number {
  return Math.max(
    ARROW_ENDPOINT_HANDLE_OFFSET_MIN,
    settings.width * ARROW_ENDPOINT_HANDLE_OFFSET_WIDTH_MULTIPLIER
  );
}

function normalizeVector(vector: PointLike): PointLike {
  const length = Math.hypot(vector.x, vector.y);
  return length === 0 ? DEFAULT_ARROW_DIRECTION : { x: vector.x / length, y: vector.y / length };
}

function getEndpointTangent(points: readonly PointLike[], index: number): PointLike {
  const point = points[index];
  if (!point) {
    return DEFAULT_ARROW_DIRECTION;
  }

  if (index === 0) {
    for (let referenceIndex = 1; referenceIndex < points.length; referenceIndex += 1) {
      const reference = points[referenceIndex];
      if (!reference) {
        continue;
      }

      const vector = { x: reference.x - point.x, y: reference.y - point.y };
      if (vector.x !== 0 || vector.y !== 0) {
        return normalizeVector(vector);
      }
    }

    return DEFAULT_ARROW_DIRECTION;
  }

  for (let referenceIndex = index - 1; referenceIndex >= 0; referenceIndex -= 1) {
    const reference = points[referenceIndex];
    if (!reference) {
      continue;
    }

    const vector = { x: point.x - reference.x, y: point.y - reference.y };
    if (vector.x !== 0 || vector.y !== 0) {
      return normalizeVector(vector);
    }
  }

  return DEFAULT_ARROW_DIRECTION;
}

export function getEndpointOffsetVector(
  pointIndex: number,
  points: readonly PointLike[],
  settings: EditorArrowSettings
): PointLike {
  const endpointIndex = getArrowEndpointIndex(pointIndex, points.length);
  if (endpointIndex === null) {
    return { x: 0, y: 0 };
  }

  const direction = endpointIndex === 0 ? -1 : 1;
  const tangent = getEndpointTangent(points, endpointIndex);
  const distance = getEndpointHandleOffsetDistance(settings);
  return {
    x: tangent.x * distance * direction,
    y: tangent.y * distance * direction,
  };
}

export function offsetArrowEndpointControlPoint(
  point: PointLike,
  points: readonly PointLike[],
  index: number,
  settings: EditorArrowSettings
): PointLike {
  const offset = getEndpointOffsetVector(index, points, settings);
  return {
    x: point.x + offset.x,
    y: point.y + offset.y,
  };
}
