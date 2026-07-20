import { Path, type BaseBrush, type FabricObject } from 'fabric';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { createObjectLabel } from '../../../document/model';
import {
  consumeCommittedFreehandPoints,
  consumeCommittedFreehandStrokeSamples,
} from '../brush-committed';
import { buildFreehandPathData } from '../path-data';
import { recoverFreehandPointsFromPath, serializeFreehandPoints } from '../points';
import { serializeFreehandSamples } from '../samples';
import { applyFreehandObjectStyle } from './style';
import type { FreehandTool } from './types';

export function configureFreehandPath(options: {
  brush: BaseBrush | null | undefined;
  labelIndex: number;
  path: FabricObject;
  settings: EditorBrushSettings;
  tool: FreehandTool;
}): void {
  const points =
    consumeCommittedFreehandPoints(options.brush) ?? recoverFreehandPointsFromPath(options.path);
  const samples = consumeCommittedFreehandStrokeSamples(options.brush);
  options.path.sniptaleId = crypto.randomUUID();
  options.path.sniptaleType = options.tool;
  options.path.sniptaleRole = 'annotation';
  options.path.sniptaleLabel = createObjectLabel(options.tool, options.labelIndex);
  if (points) {
    const pathData =
      options.tool === 'pencil' &&
      options.settings.dynamicWidth === true &&
      options.path instanceof Path
        ? buildFreehandPathData(points, options.settings, options.path.canvas, samples)
        : null;
    if (pathData) {
      (options.path as Path)._setPath(pathData, true);
    }
    options.path.sniptaleBrushPointsJson = serializeFreehandPoints(points);
    if (samples) {
      options.path.sniptaleBrushSamplesJson = serializeFreehandSamples(samples);
    }
  }
  applyFreehandObjectStyle(options.path, options.settings);
}
