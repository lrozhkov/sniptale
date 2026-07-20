import { clamp, ease } from '../math.js';
import type { HydratedSvgVector } from './vector-parser.js';
import type { SvgPartTransform, SvgPartTransformResult } from './vector-renderer.js';

export function createSvgPartTransform(args: Record<string, unknown> = {}): SvgPartTransform {
  const mode = stringOr(args['mode'], 'assemble');
  const reveal = clamp(Number(args['reveal'] ?? 1), 0, 1);
  const spread = Math.max(0, Number(args['spread'] ?? 0));
  const blur = Math.max(0, Number(args['blur'] ?? 0));
  const stagger = clamp(Number(args['stagger'] ?? 0.36), 0, 0.95);
  const orderMode = stringOr(args['order'], 'document');
  const scaleFrom = Number(args['scaleFrom'] ?? 0.92);
  const rotate = Number(args['rotate'] ?? 0.28);
  return function svgPartTransform(
    part,
    index: number,
    parsed: HydratedSvgVector
  ): SvgPartTransformResult {
    const count = Math.max(1, parsed.parts.length);
    const order = resolveSvgPartOrder(index, count, orderMode);
    const start = count <= 1 ? 0 : (order / (count - 1)) * stagger;
    const available = Math.max(0.001, 1 - start);
    const p = ease(stringOr(args['ease'], 'out'), clamp((reveal - start) / available, 0, 1));
    const angle = Number(args['angle'] ?? index * 2.399963);
    const distance = spread * (1 - p);
    const dir = index % 2 === 0 ? -1 : 1;
    const scatter = mode === 'scatter' || mode === 'shatter';
    return {
      alpha: p,
      filter: blur > 0 && p < 0.999 ? `blur(${((1 - p) * blur).toFixed(2)}px)` : 'none',
      originX: part.cx,
      originY: part.cy,
      rotate: scatter ? (1 - p) * dir * rotate : 0,
      scale: scaleFrom + (1 - scaleFrom) * p,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
    };
  };
}

function resolveSvgPartOrder(index: number, count: number, orderMode: string) {
  if (count <= 1) return 0;
  if (orderMode === 'reverse') return count - index - 1;
  if (orderMode === 'center') {
    const center = (count - 1) / 2;
    return Math.min(count - 1, Math.round(Math.abs(index - center) * 2));
  }
  if (orderMode === 'edges') {
    return Math.min(count - 1, Math.round(Math.min(index, count - index - 1) * 2));
  }
  if (orderMode === 'random') return stablePartRank(index, count);
  return index;
}

function stablePartRank(index: number, count: number) {
  const value = ((index + 1) * 1103515245 + 12345) >>> 0;
  let rank = 0;
  for (let i = 0; i < count; i += 1) {
    const other = ((i + 1) * 1103515245 + 12345) >>> 0;
    if (other < value || (other === value && i < index)) {
      rank += 1;
    }
  }
  return rank;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
