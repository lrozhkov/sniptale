import {
  EFFECT_V1_EXPRESSION_OPS,
  type EffectV1Expression,
  type EffectV1ExpressionOp,
} from '@sniptale/runtime-contracts/effect-v1';
import type { EffectRuntimeWorkerAsset } from '../../../contracts/effect-runtime/types.js';
import type { RuntimeCanvas, RuntimeLayerState } from '../model/types.js';
import { evaluateEffectV1Operation } from './expression-operations.js';

interface EffectV1ExpressionContext {
  assets?: Record<string, EffectRuntimeWorkerAsset>;
  controls: Record<string, number | string>;
  createCanvas?: (width: number, height: number) => RuntimeCanvas;
  duration?: number;
  frameIndex?: number;
  height: number;
  inputFrames?: Partial<Record<'from' | 'source' | 'to', ImageBitmap>>;
  progress?: number;
  resolveLayer(layerId: string): RuntimeLayerState | null | undefined;
  time?: number;
  track(trackId: string, fallback: unknown): unknown;
  width: number;
}

export type EffectV1EvaluationScope<
  Context extends EffectV1ExpressionContext = EffectV1ExpressionContext,
> = {
  context: Context;
  definitions: Record<string, EffectV1Expression>;
  definitionCache: Map<string, unknown>;
  item?: unknown;
  vars: Record<string, unknown>;
};

export function evaluateEffectV1Expression(
  expression: EffectV1Expression | unknown,
  scope: EffectV1EvaluationScope
): unknown {
  if (
    expression == null ||
    typeof expression === 'boolean' ||
    typeof expression === 'number' ||
    typeof expression === 'string'
  ) {
    return expression;
  }
  if (!isRecord(expression)) return null;
  const op = expression['op'];
  if (op === 'read') return readEffectV1Value(String(expression['path'] ?? ''), scope);
  if (op === 'fallback') return evaluateFallback(expression, scope);
  if (op === 'select') return evaluateSelect(expression, scope);
  if (!isExpressionOp(op)) throw new Error(`Unsupported EffectV1 expression ${String(op)}.`);
  const values = Array.isArray(expression['args'])
    ? expression['args'].map((value) => evaluateEffectV1Expression(value, scope))
    : [];
  return evaluateEffectV1Operation(op, values);
}

function evaluateFallback(
  expression: Record<string, unknown>,
  scope: EffectV1EvaluationScope
): unknown {
  const value = evaluateEffectV1Expression(expression['value'], scope);
  return value == null || (typeof value === 'number' && !Number.isFinite(value))
    ? evaluateEffectV1Expression(expression['fallback'], scope)
    : value;
}

function evaluateSelect(
  expression: Record<string, unknown>,
  scope: EffectV1EvaluationScope
): unknown {
  const values: unknown[] = Array.isArray(expression['values']) ? expression['values'] : [];
  return evaluateEffectV1Expression(expression['value'], scope)
    ? evaluateEffectV1Expression(values[0], scope)
    : evaluateEffectV1Expression(values[1], scope);
}

export function readEffectV1Value(path: string, scope: EffectV1EvaluationScope): unknown {
  const context = scope.context;
  if (path === 'time') return context.time;
  if (path === 'progress') return context.progress;
  if (path === 'width') return context.width;
  if (path === 'height') return context.height;
  if (path === 'frameIndex') return context.frameIndex;
  if (path === 'duration') return context.duration;
  if (path.startsWith('controls.')) return context.controls[path.slice(9)];
  if (path.startsWith('tracks.')) return context.track(path.slice(7), 0);
  if (path.startsWith('layers.')) return readLayerValue(path.slice(7), context);
  if (path.startsWith('vars.')) return getPath(scope.vars, path.slice(5).split('.'));
  if (path === 'item') return scope.item;
  if (path.startsWith('item.')) return getPath(scope.item, path.slice(5).split('.'));
  if (path.startsWith('defs.')) return readDefinition(path.slice(5), scope);
  if (path.startsWith('input.')) return readInput(path.slice(6), context);
  return undefined;
}

function readLayerValue(path: string, context: EffectV1ExpressionContext): unknown {
  const [layerId, ...property] = path.split('.');
  if (!layerId) return undefined;
  const layer = context.resolveLayer(layerId);
  return property.length > 0 ? getPath(layer, property) : layer;
}

function readDefinition(id: string, scope: EffectV1EvaluationScope): unknown {
  if (scope.definitionCache.has(id)) return scope.definitionCache.get(id);
  const definition = scope.definitions[id];
  if (definition === undefined) return undefined;
  const value = evaluateEffectV1Expression(definition, scope);
  scope.definitionCache.set(id, value);
  return value;
}

function readInput(name: string, context: EffectV1ExpressionContext): ImageBitmap | undefined {
  return name === 'source' || name === 'from' || name === 'to'
    ? context.inputFrames?.[name]
    : undefined;
}

function getPath(value: unknown, parts: string[]): unknown {
  let current = value;
  for (const part of parts) {
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function isExpressionOp(value: unknown): value is EffectV1ExpressionOp {
  return EFFECT_V1_EXPRESSION_OPS.some((operation) => operation === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
