import type { EffectV1ExpressionOp } from '@sniptale/runtime-contracts/effect-v1';
import { clamp } from '../timeline/easing';

export function evaluateEffectV1Operation(op: EffectV1ExpressionOp, values: unknown[]): unknown {
  switch (op) {
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'neg':
    case 'min':
    case 'max':
    case 'clamp':
    case 'abs':
    case 'floor':
    case 'pow':
    case 'sqrt':
    case 'exp':
    case 'mod':
    case 'mix':
      return evaluateArithmetic(op, values);
    case 'sin':
    case 'cos':
    case 'out':
    case 'inOut':
      return evaluateCurve(op, values);
    case 'eq':
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte':
    case 'and':
    case 'or':
    case 'not':
      return evaluateLogic(op, values);
    case 'concat':
      return values.map(String).join('');
    case 'point':
      return { x: number(values[0]), y: number(values[1]) };
    case 'rgba':
      return rgba(values);
    case 'cubicPoint':
      return cubicPoint(values);
    case 'cubicTangent':
      return cubicTangent(values);
    case 'ellipsePoint':
    case 'ellipseVelocity':
      return ellipse(op === 'ellipseVelocity', values);
    default:
      throw new Error(`Unsupported EffectV1 expression ${op}.`);
  }
}

function evaluateArithmetic(op: EffectV1ExpressionOp, values: unknown[]): number {
  if (op === 'add') return values.reduce<number>((sum, value) => sum + number(value), 0);
  if (op === 'sub') return number(values[0]) - number(values[1]);
  if (op === 'mul') return values.reduce<number>((product, value) => product * number(value), 1);
  if (op === 'div') {
    const divisor = number(values[1]);
    return divisor === 0 ? 0 : number(values[0]) / divisor;
  }
  if (op === 'neg') return -number(values[0]);
  if (op === 'min') return Math.min(...values.map(number));
  if (op === 'max') return Math.max(...values.map(number));
  if (op === 'clamp') return clamp(number(values[0]), number(values[1]), number(values[2]));
  if (op === 'abs') return Math.abs(number(values[0]));
  if (op === 'floor') return Math.floor(number(values[0]));
  if (op === 'pow') return finite(Math.pow(number(values[0]), number(values[1])));
  if (op === 'sqrt') return Math.sqrt(Math.max(0, number(values[0])));
  if (op === 'exp') return finite(Math.exp(clamp(number(values[0]), -100, 100)));
  if (op === 'mod') {
    const divisor = Math.abs(number(values[1]));
    return divisor === 0 ? 0 : ((number(values[0]) % divisor) + divisor) % divisor;
  }
  return number(values[0]) + (number(values[1]) - number(values[0])) * number(values[2]);
}

function evaluateCurve(op: EffectV1ExpressionOp, values: unknown[]): number {
  const value = number(values[0]);
  if (op === 'sin') return Math.sin(value);
  if (op === 'cos') return Math.cos(value);
  const progress = clamp(value, 0, 1);
  if (op === 'out') return 1 - Math.pow(1 - progress, 3);
  return progress < 0.5
    ? 4 * progress * progress * progress
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function evaluateLogic(op: EffectV1ExpressionOp, values: unknown[]): boolean {
  if (op === 'eq') return values[0] === values[1];
  if (op === 'and') return values.every(Boolean);
  if (op === 'or') return values.some(Boolean);
  if (op === 'not') return !values[0];
  const left = number(values[0]);
  const right = number(values[1]);
  if (op === 'lt') return left < right;
  if (op === 'lte') return left <= right;
  if (op === 'gt') return left > right;
  return left >= right;
}

function rgba(values: unknown[]): string {
  const red = clamp(Math.round(number(values[0])), 0, 255);
  const green = clamp(Math.round(number(values[1])), 0, 255);
  const blue = clamp(Math.round(number(values[2])), 0, 255);
  const alpha = clamp(number(values[3] ?? 1), 0, 1);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function cubicPoint(values: unknown[]): { x: number; y: number } {
  const t = number(values[4]);
  const u = 1 - t;
  return {
    x: cubicCoordinate(values, 'x', u, t),
    y: cubicCoordinate(values, 'y', u, t),
  };
}

function cubicCoordinate(values: unknown[], coordinate: 'x' | 'y', u: number, t: number): number {
  return (
    u ** 3 * pointCoordinate(values[0], coordinate) +
    3 * u * u * t * pointCoordinate(values[1], coordinate) +
    3 * u * t * t * pointCoordinate(values[2], coordinate) +
    t ** 3 * pointCoordinate(values[3], coordinate)
  );
}

function cubicTangent(values: unknown[]): { x: number; y: number } {
  const t = number(values[4]);
  const u = 1 - t;
  return {
    x: tangentCoordinate(values, 'x', u, t),
    y: tangentCoordinate(values, 'y', u, t),
  };
}

function tangentCoordinate(values: unknown[], coordinate: 'x' | 'y', u: number, t: number): number {
  const points = values.slice(0, 4).map((value) => pointCoordinate(value, coordinate));
  return (
    3 * u * u * (points[1]! - points[0]!) +
    6 * u * t * (points[2]! - points[1]!) +
    3 * t * t * (points[3]! - points[2]!)
  );
}

function ellipse(velocity: boolean, values: unknown[]): { x: number; y: number } {
  const [cx = 0, cy = 0, rx = 0, ry = 0, angle = 0] = values.map(number);
  return velocity
    ? { x: -rx * Math.sin(angle), y: ry * Math.cos(angle) }
    : { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) };
}

function pointCoordinate(value: unknown, coordinate: 'x' | 'y'): number {
  return isRecord(value) ? number(value[coordinate]) : 0;
}

function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
