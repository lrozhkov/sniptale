import type { Path } from 'fabric';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import type { FreehandPointRecord } from '../points';
import type { FreehandStrokeSample } from '../samples';
import { buildDynamicDotPath, shouldRenderDynamicDot } from './dot';
import { buildClosedOutlinePath } from './outline/path';
import { buildOutlinePoints } from './outline/points';
import { smoothDynamicStrokePoints } from './smoothing/pass';
import type { DynamicFreehandPathBuildOptions } from './types';
import { resolveDynamicWidthPoints } from './width/points';
import { stabilizeEndpointWidths } from './width/endpoints';

export function buildDynamicFreehandPathData(
  points: readonly FreehandPointRecord[],
  settings: EditorBrushSettings,
  samples?: readonly FreehandStrokeSample[] | null,
  options?: DynamicFreehandPathBuildOptions
): Path['path'] | null {
  if (points.length === 0) {
    return null;
  }

  const dynamicPoints = stabilizeEndpointWidths(
    smoothDynamicStrokePoints(
      resolveDynamicWidthPoints(points, settings, samples),
      settings.smoothingLevel,
      options
    )
  );
  if (shouldRenderDynamicDot(dynamicPoints, settings.width)) {
    return buildDynamicDotPath(dynamicPoints);
  }

  const outline = buildOutlinePoints(dynamicPoints);
  const firstPoint = outline[0];
  if (!firstPoint) {
    return null;
  }

  return buildClosedOutlinePath(outline);
}
