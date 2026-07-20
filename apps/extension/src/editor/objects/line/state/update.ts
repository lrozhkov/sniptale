import { Path } from 'fabric';
import { normalizeLinePoints } from '../geometry';
import { buildLinePathData } from '../path';
import { buildRoughLinePathData, shouldRenderRoughLine } from '../rough';
import { readLineSettings } from '../settings/read';
import type { LinePathInstance } from '../types';
import { resolveLineFill } from './fill';
import { syncLineMetadata } from './metadata';
import { readLinePoints } from './points';
import { applyLineControlStyle, applyLinePathStyle } from './style';
import type { LineUpdateOptions } from './types';

export function updateLineObject(line: LinePathInstance, options: LineUpdateOptions): void {
  const settings = options.settings ?? readLineSettings(line);
  const points = normalizeLinePoints(options.points ?? readLinePoints(line));
  const closed = options.closed ?? line.sniptaleLineClosed;
  const previousTranslation = {
    x: (line.left ?? 0) - line.pathOffset.x,
    y: (line.top ?? 0) - line.pathOffset.y,
  };
  const roughRender = shouldRenderRoughLine(settings);
  const pathData = roughRender
    ? buildRoughLinePathData(points, settings, closed)
    : buildLinePathData(points, settings, closed);
  const draft = new Path(pathData || 'M 0 0 L 0 0');

  applyLinePathStyle(line, draft, settings);
  line.setDimensions();
  line.set({
    fill: resolveLineFill(line, settings, closed),
    left: line.pathOffset.x + previousTranslation.x,
    top: line.pathOffset.y + previousTranslation.y,
    originX: 'center',
    originY: 'center',
  });

  syncLineMetadata(line, settings, points, closed);
  applyLineControlStyle(line);
  line.set('dirty', true);
  line.setCoords();
}
