import type { BaseBrush } from 'fabric';
import { isFreehandPointRecord, type FreehandPointRecord } from './points';
import { normalizeFreehandStrokeSamples, type FreehandStrokeSample } from './samples';

interface BrushWithCommittedPoints extends BaseBrush {
  consumeCommittedPoints(): FreehandPointRecord[] | null;
}

interface BrushWithCommittedStrokeSamples extends BaseBrush {
  consumeCommittedStrokeSamples(): FreehandStrokeSample[] | null;
}

function hasFunctionProperty<TName extends string>(
  value: object,
  property: TName
): value is Record<TName, (...args: never[]) => unknown> {
  const candidate: object & { [key in TName]?: unknown } = value;
  return property in candidate && typeof candidate[property] === 'function';
}

function isBrushWithCommittedPoints(
  brush: BaseBrush | null | undefined
): brush is BrushWithCommittedPoints {
  return !!brush && hasFunctionProperty(brush, 'consumeCommittedPoints');
}

function isBrushWithCommittedStrokeSamples(
  brush: BaseBrush | null | undefined
): brush is BrushWithCommittedStrokeSamples {
  return !!brush && hasFunctionProperty(brush, 'consumeCommittedStrokeSamples');
}

export function consumeCommittedFreehandPoints(
  brush: BaseBrush | null | undefined
): FreehandPointRecord[] | null {
  const committedPoints = isBrushWithCommittedPoints(brush) ? brush.consumeCommittedPoints() : null;
  if (!Array.isArray(committedPoints)) {
    return null;
  }

  const points = committedPoints
    .filter(isFreehandPointRecord)
    .map((point) => ({ x: point.x, y: point.y }));
  return points.length > 0 ? points : null;
}

export function consumeCommittedFreehandStrokeSamples(
  brush: BaseBrush | null | undefined
): FreehandStrokeSample[] | null {
  return isBrushWithCommittedStrokeSamples(brush)
    ? normalizeFreehandStrokeSamples(brush.consumeCommittedStrokeSamples())
    : null;
}
