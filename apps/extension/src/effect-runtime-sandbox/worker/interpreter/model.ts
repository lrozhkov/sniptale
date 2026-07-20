import type { EffectV1Command } from '@sniptale/runtime-contracts/effect-v1';
import type { EffectRuntimeWorkerSvgAsset } from '../../../contracts/effect-runtime/types.js';
import type { DrawImageAssetArgs, RuntimeBitmapAsset } from '../assets/render-assets.js';
import type { DrawSvgVectorArgs, SvgPartTransform } from '../svg/vector-renderer.js';
import type {
  EffectRuntimeGraphFrameContext,
  RuntimeCanvas,
  RuntimeCanvasContext,
  RuntimeLayerState,
} from '../model/types.js';
import { evaluateEffectV1Expression, type EffectV1EvaluationScope } from './expression.js';

export interface EffectRuntimeInterpreter {
  drawImageAsset(
    context: RuntimeCanvasContext,
    asset: RuntimeBitmapAsset,
    args: DrawImageAssetArgs
  ): void;
  drawSvgVectorAsset(
    context: RuntimeCanvasContext,
    asset: EffectRuntimeWorkerSvgAsset,
    args: DrawSvgVectorArgs
  ): void;
  svgPartTransform(args: Record<string, unknown>): SvgPartTransform;
}

export type RenderState = {
  canvas: RuntimeCanvas;
  context: RuntimeCanvasContext;
  passes: Map<string, RuntimeCanvas>;
  runtime: EffectRuntimeInterpreter;
  scope: EffectV1EvaluationScope<EffectRuntimeGraphFrameContext>;
};

export function resolveCommandLayer(
  command: EffectV1Command,
  state: RenderState
): RuntimeLayerState | null {
  return command.layerId
    ? (state.scope.context.resolveLayer(String(command.layerId)) ?? null)
    : null;
}

export function withItem<T>(state: RenderState, item: unknown, read: () => T): T {
  const previous = state.scope.item;
  state.scope.item = item;
  try {
    return read();
  } finally {
    state.scope.item = previous;
  }
}

export function v(value: unknown, state: RenderState): unknown {
  return evaluateEffectV1Expression(value, state.scope);
}

export function n(value: unknown, state: RenderState): number {
  const result = Number(v(value ?? 0, state));
  return Number.isFinite(result) ? result : 0;
}

export function valueOr(value: unknown, fallback: number, state: RenderState): number {
  return value === undefined ? fallback : n(value, state);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
