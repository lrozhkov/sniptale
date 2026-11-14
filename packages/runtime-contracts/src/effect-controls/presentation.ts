import { isPlainRecord as isRecord } from '../validation/primitives.js';
import {
  EFFECT_CONTROL_GROUPS,
  EFFECT_CONTROL_GROUP_LIMIT,
  EFFECT_CONTROL_GROUP_DEPTH,
  EFFECT_CONTROL_ICONS,
  EFFECT_CONTROL_ROOT_ICONS,
  type EffectControlIcon,
  type EffectSemanticControlGroup,
} from './types.js';

export function isEffectSemanticControlGroup(value: unknown): value is EffectSemanticControlGroup {
  return EFFECT_CONTROL_GROUPS.some((group) => group === value);
}

/** Return null for unknown, ambiguous, cyclic or over-deep custom hierarchies. */
export function resolveEffectControlGroup(
  group: unknown,
  definitions?: unknown
): EffectSemanticControlGroup | null {
  if (typeof group !== 'string') return null;
  if (isEffectSemanticControlGroup(group)) return group;
  if (definitions === undefined) return isEffectSemanticControlGroup(group) ? group : null;
  if (!Array.isArray(definitions) || definitions.length > EFFECT_CONTROL_GROUP_LIMIT) return null;
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
      isEffectSemanticControlGroup(entry.id) ||
      parents.has(entry.id)
    )
      return null;
    parents.set(entry.id, entry.parentId);
  }
  let current = group;
  const seen = new Set<string>();
  for (let depth = 1; depth <= EFFECT_CONTROL_GROUP_DEPTH; depth += 1) {
    if (isEffectSemanticControlGroup(current)) return current;
    if (seen.has(current)) return null;
    seen.add(current);
    const parent = parents.get(current);
    if (parent === undefined) return null;
    current = parent;
  }
  return null;
}

export function resolveEffectControlGroupIcons(
  definitions: unknown,
  controls: unknown
): ReadonlyMap<number, EffectControlIcon> {
  if (!Array.isArray(definitions) || definitions.length > EFFECT_CONTROL_GROUP_LIMIT)
    return new Map<number, EffectControlIcon>();
  const groups: unknown[] = definitions;
  const entries: unknown[] = Array.isArray(controls) ? controls : [];
  const roots = new Set<string>();
  for (const control of entries) {
    if (!isRecord(control)) continue;
    const root =
      control['group'] === undefined
        ? 'advanced'
        : resolveEffectControlGroup(control['group'], groups);
    if (root !== null) roots.add(root);
  }
  const used = new Set<string>();
  for (const root of EFFECT_CONTROL_GROUPS)
    if (roots.has(root)) used.add(EFFECT_CONTROL_ROOT_ICONS[root]);
  const accepted = new Map<number, EffectControlIcon>();
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group)) continue;
    const icon = EFFECT_CONTROL_ICONS.find((icon) => icon === group['icon']);
    if (icon === undefined || used.has(icon)) continue;
    accepted.set(index, icon);
    used.add(icon);
  }
  return accepted;
}
