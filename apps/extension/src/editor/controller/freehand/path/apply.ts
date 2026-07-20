import { Path, type FabricObject } from 'fabric';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { buildFreehandPathData } from '../path-data';
import { serializeFreehandPoints } from '../points';
import { serializeFreehandSamples } from '../samples';
import { translatePointsToObjectPosition, translateSamplesToObjectPosition } from './position';
import { resolveObjectPoints, resolveObjectSamples } from './stored';
import { applyFreehandObjectStyle } from './style';

export function applyFreehandSettingsToObject(
  object: FabricObject,
  settings: EditorBrushSettings
): void {
  const points = resolveObjectPoints(object);
  if (object instanceof Path && points) {
    const translatedPoints = translatePointsToObjectPosition(object, points);
    const translatedSamples = translateSamplesToObjectPosition(
      object,
      resolveObjectSamples(object)
    );
    const pathData = buildFreehandPathData(
      translatedPoints,
      settings,
      object.canvas,
      translatedSamples
    );
    if (pathData) {
      object._setPath(pathData, true);
      object.sniptaleBrushPointsJson = serializeFreehandPoints(translatedPoints);
      if (translatedSamples) {
        object.sniptaleBrushSamplesJson = serializeFreehandSamples(translatedSamples);
      }
    }
  }

  applyFreehandObjectStyle(object, settings);
  if (typeof object.setCoords === 'function') {
    object.setCoords();
  }
}
