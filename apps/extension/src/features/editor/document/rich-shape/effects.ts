import { DEFAULT_RICH_SHAPE_EFFECTS } from './defaults';
import type { EditorRichShapeEffects } from './types';
import { isRecord, numberOr, stringOr } from './values';

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeEffects(value: unknown): EditorRichShapeEffects {
  const effects = isRecord(value) ? value : {};
  const shadow = isRecord(effects['shadow']) ? effects['shadow'] : {};
  const reflection = isRecord(effects['reflection']) ? effects['reflection'] : {};
  const glow = isRecord(effects['glow']) ? effects['glow'] : {};
  const softEdge = isRecord(effects['softEdge']) ? effects['softEdge'] : {};

  return {
    shadow: {
      enabled: booleanOr(shadow['enabled'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.enabled),
      color: stringOr(shadow['color'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.color),
      opacity: numberOr(shadow['opacity'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.opacity),
      blur: numberOr(shadow['blur'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.blur),
      angle: numberOr(shadow['angle'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.angle),
      distance: numberOr(shadow['distance'], DEFAULT_RICH_SHAPE_EFFECTS.shadow.distance),
    },
    reflection: {
      enabled: booleanOr(reflection['enabled'], DEFAULT_RICH_SHAPE_EFFECTS.reflection.enabled),
      opacity: numberOr(reflection['opacity'], DEFAULT_RICH_SHAPE_EFFECTS.reflection.opacity),
      distance: numberOr(reflection['distance'], DEFAULT_RICH_SHAPE_EFFECTS.reflection.distance),
      size: numberOr(reflection['size'], DEFAULT_RICH_SHAPE_EFFECTS.reflection.size),
    },
    glow: {
      enabled: booleanOr(glow['enabled'], DEFAULT_RICH_SHAPE_EFFECTS.glow.enabled),
      color: stringOr(glow['color'], DEFAULT_RICH_SHAPE_EFFECTS.glow.color),
      opacity: numberOr(glow['opacity'], DEFAULT_RICH_SHAPE_EFFECTS.glow.opacity),
      radius: numberOr(glow['radius'], DEFAULT_RICH_SHAPE_EFFECTS.glow.radius),
    },
    softEdge: {
      enabled: booleanOr(softEdge['enabled'], DEFAULT_RICH_SHAPE_EFFECTS.softEdge.enabled),
      radius: numberOr(softEdge['radius'], DEFAULT_RICH_SHAPE_EFFECTS.softEdge.radius),
    },
  };
}
