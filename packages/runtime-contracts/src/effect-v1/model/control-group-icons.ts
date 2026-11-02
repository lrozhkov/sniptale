import {
  EFFECT_V1_CONTROL_GROUPS,
  EFFECT_V1_CONTROL_GROUP_LIMIT,
  EFFECT_V1_CONTROL_ICONS,
  EFFECT_V1_CONTROL_ROOT_ICONS,
  resolveEffectV1ControlGroup,
  type EffectV1ControlIcon,
} from './control-presentation.js';

/** Accepted custom icons keyed by declaration index; roots reserve first. No source mutation. */
export function resolveEffectV1ControlGroupIcons(
  definitions: unknown,
  controls: unknown
): ReadonlyMap<number, EffectV1ControlIcon> {
  if (!Array.isArray(definitions) || definitions.length > EFFECT_V1_CONTROL_GROUP_LIMIT)
    return new Map<number, EffectV1ControlIcon>();
  const groups: unknown[] = definitions;
  const entries: unknown[] = Array.isArray(controls) ? controls : [];
  const roots = new Set<string>();
  for (const control of entries) {
    if (!isRecord(control)) continue;
    const root =
      control['group'] === undefined
        ? 'advanced'
        : resolveEffectV1ControlGroup(control['group'], groups);
    if (root !== null) roots.add(root);
  }
  const used = new Set<string>();
  for (const root of EFFECT_V1_CONTROL_GROUPS)
    if (roots.has(root)) used.add(EFFECT_V1_CONTROL_ROOT_ICONS[root]);
  const accepted = new Map<number, EffectV1ControlIcon>();
  for (const [index, group] of groups.entries()) {
    if (!isRecord(group)) continue;
    const icon = EFFECT_V1_CONTROL_ICONS.find((icon) => icon === group['icon']);
    if (icon === undefined || used.has(icon)) continue;
    accepted.set(index, icon);
    used.add(icon);
  }
  return accepted;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
