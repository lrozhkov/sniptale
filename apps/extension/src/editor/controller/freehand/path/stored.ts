import type { FabricObject } from 'fabric';
import {
  parseFreehandPointsJson,
  recoverFreehandPointsFromPath,
  serializeFreehandPoints,
  type FreehandPointRecord,
} from '../points';
import { parseFreehandSamplesJson, type FreehandStrokeSample } from '../samples';

export function resolveObjectPoints(object: FabricObject): FreehandPointRecord[] | null {
  const storedPoints = parseFreehandPointsJson(object.sniptaleBrushPointsJson);
  if (storedPoints) {
    return storedPoints;
  }

  const recoveredPoints = recoverFreehandPointsFromPath(object);
  if (!recoveredPoints) {
    return null;
  }

  object.sniptaleBrushPointsJson = serializeFreehandPoints(recoveredPoints);
  return recoveredPoints;
}

export function resolveObjectSamples(object: FabricObject): FreehandStrokeSample[] | null {
  return parseFreehandSamplesJson(object.sniptaleBrushSamplesJson);
}
