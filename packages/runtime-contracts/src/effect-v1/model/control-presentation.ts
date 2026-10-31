import type { LocaleText } from './locale-types.js';

export const EFFECT_V1_CONTROL_GROUPS = [
  'content',
  'typography',
  'appearance',
  'geometry',
  'processing',
  'animation',
  'advanced',
] as const;
export const EFFECT_V1_CONTROL_UNITS = [
  'px',
  'percent',
  's',
  'ms',
  'deg',
  'ratio',
  'count',
] as const;
export const EFFECT_V1_CONTROL_PRESENTATIONS = [
  'auto',
  'number',
  'slider',
  'text',
  'textarea',
  'dropdown',
  'segmented',
  'toggle',
  'color',
] as const;
export const EFFECT_V1_CONTROL_ICONS = [
  'text',
  'type',
  'font-size',
  'font-weight',
  'align-left',
  'align-center',
  'align-right',
  'align-justify',
  'palette',
  'fill',
  'stroke',
  'opacity',
  'shadow',
  'blur',
  'position',
  'move',
  'size',
  'width',
  'height',
  'rotation',
  'scale',
  'spacing',
  'corner-radius',
  'shape',
  'rectangle',
  'circle',
  'pointer',
  'anchor',
  'layers',
  'layout',
  'list',
  'grid',
  'play',
  'pause',
  'clock',
  'timer',
  'duration',
  'speed',
  'repeat',
  'sparkles',
  'settings',
  'sliders',
  'check',
  'x',
] as const;
export const EFFECT_V1_CONTROL_GROUP_LIMIT = 64;
export const EFFECT_V1_CONTROL_GROUP_DEPTH = 4;

export type EffectV1SemanticControlGroup = (typeof EFFECT_V1_CONTROL_GROUPS)[number];
export type EffectV1ControlUnit = (typeof EFFECT_V1_CONTROL_UNITS)[number];
export type EffectV1ControlPresentation = (typeof EFFECT_V1_CONTROL_PRESENTATIONS)[number];
export type EffectV1ControlIcon = (typeof EFFECT_V1_CONTROL_ICONS)[number];
export type EffectV1ControlGroup = {
  id: string;
  label: LocaleText & { en: string };
  parentId: string;
  order?: number;
  icon?: EffectV1ControlIcon;
  collapsed?: boolean;
};

export function isEffectV1SemanticControlGroup(
  value: unknown
): value is EffectV1SemanticControlGroup {
  return EFFECT_V1_CONTROL_GROUPS.some((group) => group === value);
}

/** Return null for unknown, ambiguous, cyclic or over-deep custom hierarchies. */
export function resolveEffectV1ControlGroup(
  group: unknown,
  definitions?: unknown
): EffectV1SemanticControlGroup | null {
  if (typeof group !== 'string') return null;
  if (isEffectV1SemanticControlGroup(group)) return group;
  if (definitions === undefined) return isEffectV1SemanticControlGroup(group) ? group : null;
  if (!Array.isArray(definitions) || definitions.length > EFFECT_V1_CONTROL_GROUP_LIMIT)
    return null;
  const entries: unknown[] = definitions;
  const parents = new Map<string, string>();
  for (const entry of entries) {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      Array.isArray(entry) ||
      !('id' in entry) ||
      typeof entry.id !== 'string' ||
      !('parentId' in entry) ||
      typeof entry.parentId !== 'string' ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(entry.id) ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(entry.parentId) ||
      isEffectV1SemanticControlGroup(entry.id) ||
      parents.has(entry.id)
    )
      return null;
    parents.set(entry.id, entry.parentId);
  }
  let current = group;
  const seen = new Set<string>();
  for (let depth = 1; depth <= EFFECT_V1_CONTROL_GROUP_DEPTH; depth += 1) {
    if (isEffectV1SemanticControlGroup(current)) return current;
    if (seen.has(current)) return null;
    seen.add(current);
    const parent = parents.get(current);
    if (parent === undefined) return null;
    current = parent;
  }
  return null;
}
