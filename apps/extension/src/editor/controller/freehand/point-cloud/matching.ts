import type { FreehandPointRecord } from '../points';
import { measureDistance } from '../metrics';
import type { FreehandRecognitionCandidate } from '../recognition-types';
import { POINT_CLOUD_GREEDY_EPSILON } from './constants';
import { POINT_CLOUD_TEMPLATES } from './templates';

function cloudDistance(
  candidatePoints: readonly FreehandPointRecord[],
  referencePoints: readonly FreehandPointRecord[],
  startIndex: number
): number {
  const matched = Array.from({ length: referencePoints.length }, () => false);
  let total = 0;
  let index = startIndex;

  do {
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestIndex = -1;

    for (let templateIndex = 0; templateIndex < referencePoints.length; templateIndex += 1) {
      if (matched[templateIndex]) {
        continue;
      }

      const distance = measureDistance(candidatePoints[index]!, referencePoints[templateIndex]!);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = templateIndex;
      }
    }

    matched[nearestIndex] = true;
    const offset = (index - startIndex + candidatePoints.length) % candidatePoints.length;
    const weight = 1 - offset / candidatePoints.length;
    total += weight * nearestDistance;
    index = (index + 1) % candidatePoints.length;
  } while (index !== startIndex);

  return total;
}

function greedyCloudMatch(
  points: readonly FreehandPointRecord[],
  template: readonly FreehandPointRecord[]
): number {
  const step = Math.max(1, Math.floor(points.length ** (1 - POINT_CLOUD_GREEDY_EPSILON)));
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length; index += step) {
    bestDistance = Math.min(
      bestDistance,
      cloudDistance(points, template, index),
      cloudDistance(template, points, index)
    );
  }

  return bestDistance;
}

function normalizeConfidence(distance: number): number {
  return Math.max(0, Math.min(1, 1 / (1 + distance)));
}

export function pickBestPointCloudTemplate(
  points: readonly FreehandPointRecord[],
  closed: boolean
): FreehandRecognitionCandidate | null {
  let bestCandidate: FreehandRecognitionCandidate | null = null;

  for (const template of POINT_CLOUD_TEMPLATES) {
    if (template.closed !== closed) {
      continue;
    }

    const confidence = normalizeConfidence(greedyCloudMatch(points, template.points));
    if (!bestCandidate || confidence > bestCandidate.confidence) {
      bestCandidate = {
        confidence,
        kind: template.kind,
      };
    }
  }

  return bestCandidate;
}
