import { getLogicalCanvasScale } from '../canvas/logical-canvas.js';
import type { HydratedSvgVector } from '../svg/vector-parser.js';
import type { SvgPartTransform, SvgPartTransformResult } from '../svg/vector-renderer.js';
import { isRecord, n, type RenderState, v, withItem } from './model.js';

export function createSvgPartTransform(
  value: unknown,
  state: RenderState
): SvgPartTransform | undefined {
  if (!isRecord(value)) return undefined;
  if (value['kind'] === 'preset') {
    const resolved = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'kind')
        .map(([key, expression]) => [key, v(expression, state)])
    );
    return state.runtime.svgPartTransform(resolved);
  }
  if (value['kind'] !== 'custom') return undefined;
  return (part, index: number, parsed: HydratedSvgVector) =>
    withItem(
      state,
      {
        ...part,
        count: Math.max(1, parsed?.parts?.length ?? 1),
        index,
      },
      () => resolveCustomSvgPartTransform(value, state)
    );
}

function resolveCustomSvgPartTransform(
  value: Record<string, unknown>,
  state: RenderState
): SvgPartTransformResult {
  const result: SvgPartTransformResult = {};
  for (const key of ['alpha', 'originX', 'originY', 'rotate', 'scale', 'x', 'y']) {
    if (value[key] !== undefined) setNumericTransform(result, key, n(value[key], state));
  }
  if (value['blur'] !== undefined) {
    const blur =
      Math.max(0, n(value['blur'], state)) * getLogicalCanvasScale(state.context).uniform;
    result.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : 'none';
  }
  return result;
}

function setNumericTransform(result: SvgPartTransformResult, key: string, value: number): void {
  if (key === 'alpha') result.alpha = value;
  else if (key === 'originX') result.originX = value;
  else if (key === 'originY') result.originY = value;
  else if (key === 'rotate') result.rotate = value;
  else if (key === 'scale') result.scale = value;
  else if (key === 'x') result.x = value;
  else if (key === 'y') result.y = value;
}
