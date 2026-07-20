export const EFFECT_V1_COMMAND_OPS = [
  'clear',
  'clip',
  'compositePass',
  'fillRect',
  'forEach',
  'forGrid',
  'forRange',
  'group',
  'image',
  'let',
  'path',
  'polyline',
  'renderPass',
  'sampledPath',
  'shape',
  'stableOrderBy',
  'svgParts',
  'text',
  'when',
] as const;

export const EFFECT_V1_EXPRESSION_OPS = [
  'abs',
  'add',
  'and',
  'clamp',
  'concat',
  'cos',
  'cubicPoint',
  'cubicTangent',
  'div',
  'ellipsePoint',
  'ellipseVelocity',
  'eq',
  'exp',
  'fallback',
  'floor',
  'gt',
  'gte',
  'inOut',
  'lt',
  'lte',
  'max',
  'min',
  'mix',
  'mod',
  'mul',
  'neg',
  'not',
  'or',
  'out',
  'point',
  'pow',
  'read',
  'rgba',
  'select',
  'sin',
  'sqrt',
  'sub',
] as const;

export type EffectV1CommandOp = (typeof EFFECT_V1_COMMAND_OPS)[number];
export type EffectV1ExpressionOp = (typeof EFFECT_V1_EXPRESSION_OPS)[number];
export type EffectV1RuntimeInputName = 'source' | 'from' | 'to';

export type EffectV1Expression =
  | boolean
  | number
  | string
  | null
  | {
      args?: EffectV1Expression[];
      fallback?: EffectV1Expression;
      op: EffectV1ExpressionOp;
      path?: string;
      value?: EffectV1Expression;
      values?: EffectV1Expression[];
    };
