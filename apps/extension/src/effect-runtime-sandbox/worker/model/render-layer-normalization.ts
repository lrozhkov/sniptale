import type { EffectLayer } from '@sniptale/runtime-contracts/effect-v1';

import { clamp } from '../math.js';
import type { NormalizedLayer } from './types.js';

export function normalizeLayers(rawLayers: readonly EffectLayer[]): NormalizedLayer[] {
  return rawLayers
    .map(normalizeLayer)
    .filter((layer) => layer.id.length > 0 && layer.type !== 'group');
}

function normalizeLayer(layer: EffectLayer): NormalizedLayer {
  return {
    align: stringOr(layer['align'], 'center'),
    anchorX: finiteOr(layer['anchorX'], 0),
    anchorY: finiteOr(layer['anchorY'], 0),
    assetId: stringOrNull(layer['assetId']),
    baseX: finiteOrNull(layer['baseX']),
    baseY: finiteOrNull(layer['baseY']),
    blendMode: stringOr(layer['blendMode'], 'source-over'),
    blur: finiteOr(layer['blur'], 0),
    color: stringOr(layer['color'], '#f6fbff'),
    fill: stringOr(layer['fill'], 'rgba(255,255,255,0.12)'),
    fontFamily: stringOr(layer['fontFamily'], 'Arial'),
    fontSize: finiteOr(layer['fontSize'], 48),
    fontWeight: finiteOr(layer['fontWeight'], 800),
    height: finiteOr(layer['height'], 120),
    id: String(layer.id),
    lineCap: stringOr(layer['lineCap'], 'round'),
    lineJoin: stringOr(layer['lineJoin'], 'round'),
    locked: Boolean(layer.locked),
    name: String(layer.name ?? layer.id),
    opacity: finiteOr(layer['opacity'], 1),
    parentId: typeof layer.parentId === 'string' ? layer.parentId : null,
    partBlur: finiteOr(layer['partBlur'], 0),
    partOrder: stringOr(layer['partOrder'], 'document'),
    partReveal: finiteOr(layer['partReveal'], 1),
    partSpread: finiteOr(layer['partSpread'], 0),
    partStagger: finiteOr(layer['partStagger'], 0),
    pathClosed: layer['pathClosed'] === true || layer['pathClosed'] === 'true',
    pathPoints: normalizePathPoints(layer['pathPoints']),
    radius: finiteOr(layer['radius'], 0),
    rotation: finiteOr(layer['rotation'], 0),
    scaleX: finiteOr(layer['scaleX'], 1),
    scaleY: finiteOr(layer['scaleY'], 1),
    shadowBlur: finiteOr(layer['shadowBlur'], 0),
    shadowColor: stringOr(layer['shadowColor'], '#ffffff'),
    stroke: stringOr(layer['stroke'], 'rgba(255,255,255,0.72)'),
    strokeWidth: finiteOr(layer['strokeWidth'], 1),
    svgPartIds: stringOr(layer['svgPartIds'], ''),
    svgPartMode: stringOr(layer['svgPartMode'], 'none'),
    text: stringOr(layer['text'], ''),
    trimEnd: finiteOr(layer['trimEnd'], 1),
    trimStart: finiteOr(layer['trimStart'], 0),
    type: String(layer.type || 'customDraw'),
    visible: layer.visible !== false,
    width: finiteOr(layer['width'], 240),
    x: finiteOr(layer['x'], 0),
    y: finiteOr(layer['y'], 0),
  };
}

export function normalizePathPoints(pathPoints: unknown): Array<{ x: number; y: number }> {
  if (!Array.isArray(pathPoints)) return [];
  return pathPoints.flatMap((value) => {
    if (!isRecord(value)) return [];
    const point = {
      x: clamp(Number(value['x']) || 0, -2, 2),
      y: clamp(Number(value['y']) || 0, -2, 2),
    };
    return Number.isFinite(point.x) && Number.isFinite(point.y) ? [point] : [];
  });
}

function finiteOr(value: unknown, fallback: number): number {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : fallback;
}

function finiteOrNull(value: unknown): number | null {
  const candidate = Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
