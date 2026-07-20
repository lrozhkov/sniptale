import { DEFAULT_RICH_SHAPE_ROUGH } from './defaults';
import type { EditorRichShapeRoughFillStyle, EditorRichShapeRoughStyle } from './types';
import { isNumber, isRecord, numberOr, oneOfOr, stringOr } from './values';

const ROUGH_FILL_STYLES: readonly EditorRichShapeRoughFillStyle[] = [
  'hachure',
  'solid',
  'zigzag',
  'cross-hatch',
  'dots',
  'dashed',
  'zigzag-line',
];

export function normalizeRough(value: unknown): EditorRichShapeRoughStyle {
  const rough = isRecord(value) ? value : {};
  return {
    ...DEFAULT_RICH_SHAPE_ROUGH,
    enabled:
      typeof rough['enabled'] === 'boolean' ? rough['enabled'] : DEFAULT_RICH_SHAPE_ROUGH.enabled,
    seed:
      rough['seed'] === null || isNumber(rough['seed'])
        ? rough['seed']
        : DEFAULT_RICH_SHAPE_ROUGH.seed,
    roughness: numberOr(rough['roughness'], DEFAULT_RICH_SHAPE_ROUGH.roughness),
    bowing: numberOr(rough['bowing'], DEFAULT_RICH_SHAPE_ROUGH.bowing),
    fillStyle: oneOfOr(rough['fillStyle'], ROUGH_FILL_STYLES, DEFAULT_RICH_SHAPE_ROUGH.fillStyle),
    fillColor: stringOr(rough['fillColor'], DEFAULT_RICH_SHAPE_ROUGH.fillColor ?? '#ffffff'),
    hachureGap: numberOr(rough['hachureGap'], DEFAULT_RICH_SHAPE_ROUGH.hachureGap),
    hachureAngle: numberOr(rough['hachureAngle'], DEFAULT_RICH_SHAPE_ROUGH.hachureAngle),
    fillWeight: numberOr(rough['fillWeight'], DEFAULT_RICH_SHAPE_ROUGH.fillWeight),
    fillRoughness: numberOr(
      rough['fillRoughness'],
      numberOr(rough['roughness'], DEFAULT_RICH_SHAPE_ROUGH.fillRoughness)
    ),
    fillBowing: numberOr(
      rough['fillBowing'],
      numberOr(rough['bowing'], DEFAULT_RICH_SHAPE_ROUGH.fillBowing)
    ),
    fillTransparency: numberOr(
      rough['fillTransparency'],
      DEFAULT_RICH_SHAPE_ROUGH.fillTransparency
    ),
    preserveVertices:
      typeof rough['preserveVertices'] === 'boolean'
        ? rough['preserveVertices']
        : DEFAULT_RICH_SHAPE_ROUGH.preserveVertices,
  };
}

export function createStableRichShapeRoughSeed(id: string): number {
  const source = id.trim() || 'rich-shape';
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 2147483646) + 1;
}

export function resolveRichShapeRoughSeed(shape: {
  id: string;
  rough: Pick<EditorRichShapeRoughStyle, 'seed'>;
}): number {
  if (Number.isFinite(shape.rough.seed) && Number(shape.rough.seed) > 0) {
    return Math.floor(Number(shape.rough.seed));
  }

  return createStableRichShapeRoughSeed(shape.id);
}

export function createEnabledRichShapeRoughStyle(
  id: string,
  overrides: Partial<EditorRichShapeRoughStyle> = {}
): EditorRichShapeRoughStyle {
  return normalizeRough({
    ...DEFAULT_RICH_SHAPE_ROUGH,
    ...overrides,
    enabled: true,
    seed: overrides.seed ?? createStableRichShapeRoughSeed(id),
  });
}
