import { z } from 'zod';
import { parseColor } from '@sniptale/foundation/color';
import { isEffectLocaleTag } from './locale.js';
import {
  resolveEffectControlGroup,
  resolveEffectControlGroupIcons,
  isEffectSemanticControlGroup,
} from './presentation.js';
import { validateEffectControlPresetValues } from './presets.js';
import {
  EFFECT_CONTROL_ICONS,
  EFFECT_CONTROL_PRESENTATIONS,
  EFFECT_CONTROL_UNITS,
  EFFECT_CONTROL_GROUP_LIMIT,
  type EffectControlSet,
} from './types.js';

const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/);
const finite = z.number().finite();
const order = finite.int().min(0).max(Number.MAX_SAFE_INTEGER).optional();
const icon = z.enum(EFFECT_CONTROL_ICONS).optional();
export const effectLocaleTextSchema = z
  .record(z.string().refine(isEffectLocaleTag), z.string().max(32768))
  .superRefine((value, ctx) => {
    const keys = Object.keys(value);
    if (
      keys.length === 0 ||
      keys.length > 64 ||
      new Set(keys.map((key) => key.toLowerCase())).size !== keys.length
    )
      ctx.addIssue({ code: 'custom', message: 'Use 1–64 unique locale tags.' });
  });
export const effectLocaleLabelSchema = effectLocaleTextSchema.and(
  z.object({
    en: z
      .string()
      .max(32768)
      .refine((value) => value.trim().length > 0),
  })
);
const label = effectLocaleLabelSchema;
const option = z.strictObject({ value: z.union([finite, z.string().max(32768)]), label, icon });
const metadata = {
  id: identifier,
  label: label.optional(),
  unit: z.enum(EFFECT_CONTROL_UNITS).optional(),
  presentation: z.enum(EFFECT_CONTROL_PRESENTATIONS).optional(),
  icon,
  localizedDefaultValue: label.optional(),
  group: identifier.optional(),
  order,
  options: z.array(option).min(2).max(64).optional(),
};
const control = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...metadata,
      kind: z.literal('number'),
      defaultValue: finite,
      min: finite.optional(),
      max: finite.optional(),
      step: finite.positive().optional(),
    }),
    z.strictObject({ ...metadata, kind: z.literal('text'), defaultValue: z.string().max(32768) }),
    z.strictObject({
      ...metadata,
      kind: z.literal('color'),
      defaultValue: z
        .string()
        .max(512)
        .refine((value) => parseColor(value) !== null),
    }),
  ])
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (value.kind === 'number') {
      if (value.min !== undefined && value.max !== undefined && value.min > value.max)
        fail('Minimum exceeds maximum.');
      if (
        (value.min !== undefined && value.defaultValue < value.min) ||
        (value.max !== undefined && value.defaultValue > value.max)
      )
        fail('Default is outside the numeric range.');
    } else if (value.unit !== undefined) fail('Units require a number control.');
    if (value.localizedDefaultValue !== undefined && value.kind !== 'text')
      fail('Localized defaults require a text control.');
    const presentation = value.presentation;
    const choice =
      presentation === 'dropdown' || presentation === 'segmented' || presentation === 'toggle';
    if (choice) {
      const limit = presentation === 'segmented' ? 8 : presentation === 'toggle' ? 2 : 64;
      if (!value.options || value.options.length > limit || value.kind === 'color')
        fail('Choice presentation requires matching bounded options.');
    } else if (presentation !== undefined && presentation !== 'auto') {
      const kind =
        presentation === 'number' || presentation === 'slider'
          ? 'number'
          : presentation === 'color'
            ? 'color'
            : 'text';
      if (value.kind !== kind || value.options !== undefined)
        fail('Presentation does not match the control.');
    }
    if (value.options) {
      const values = new Set(value.options.map((entry) => entry.value));
      if (
        value.kind === 'color' ||
        values.size !== value.options.length ||
        !values.has(value.defaultValue)
      )
        fail('Options must be unique and contain the default.');
      for (const entry of value.options) {
        if (typeof entry.value !== typeof value.defaultValue)
          fail('Option type does not match the control.');
        if (
          value.kind === 'number' &&
          typeof entry.value === 'number' &&
          ((value.min !== undefined && entry.value < value.min) ||
            (value.max !== undefined && entry.value > value.max))
        )
          fail('Option is outside the numeric range.');
      }
      for (const entry of Object.values(value.localizedDefaultValue ?? {}))
        if (!values.has(entry)) fail('Localized default must be a declared option.');
    }
  });
const group = z.strictObject({
  id: identifier,
  label,
  parentId: identifier,
  order,
  icon,
  collapsed: z.boolean().optional(),
});
const named = z.strictObject({ id: identifier, label });
const preset = z.strictObject({
  id: identifier,
  label,
  theme: named,
  style: named,
  values: z.record(identifier, z.union([finite, z.string().max(512)])),
});

/** Closed, bounded metadata admission shared by animation and transition packages. */
export const effectControlSetSchema = z
  .strictObject({
    controls: z.array(control).max(256),
    controlGroups: z.array(group).max(EFFECT_CONTROL_GROUP_LIMIT).optional(),
    controlPresets: z.array(preset).max(128).optional(),
    defaultControlPresetId: identifier.optional(),
  })
  .superRefine((value, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    if (new Set(value.controls.map((entry) => entry.id)).size !== value.controls.length)
      fail('Control IDs must be unique.');
    for (const entry of value.controlGroups ?? []) {
      if (
        isEffectSemanticControlGroup(entry.id) ||
        resolveEffectControlGroup(entry.id, value.controlGroups) === null
      )
        fail('Control group hierarchy is invalid.');
    }
    for (const entry of value.controls)
      if (
        entry.group !== undefined &&
        resolveEffectControlGroup(entry.group, value.controlGroups) === null
      )
        fail('Control group does not exist.');
    const icons = resolveEffectControlGroupIcons(value.controlGroups, value.controls);
    for (const [index, entry] of (value.controlGroups ?? []).entries())
      if (entry.icon !== undefined && icons.get(index) !== entry.icon)
        fail('Control group icon is already in use.');
    const presets = value.controlPresets ?? [];
    if (new Set(presets.map((entry) => entry.id)).size !== presets.length)
      fail('Preset IDs must be unique.');
    for (const entry of presets)
      if (!validateEffectControlPresetValues(value, entry.values).ok)
        fail('Preset contains invalid or protected overrides.');
    if (
      value.defaultControlPresetId !== undefined &&
      !presets.some((entry) => entry.id === value.defaultControlPresetId)
    )
      fail('Default preset does not exist.');
  });

/** Parse untrusted control metadata without retaining unknown fields or caller-owned references. */
export function parseEffectControlSet(value: unknown): EffectControlSet | null {
  const result = effectControlSetSchema.safeParse(value);
  return result.success ? result.data : null;
}

/** Stored instance values must be complete. Rendering never reapplies creation defaults or presets. */
export function parseEffectControlValues(
  document: EffectControlSet,
  value: unknown
): Record<string, number | string> | null {
  const parsed = z
    .record(z.string(), z.union([z.number().finite(), z.string().max(32768)]))
    .safeParse(value);
  if (!parsed.success || Object.keys(parsed.data).length !== document.controls.length) return null;
  for (const control of document.controls) {
    if (!Object.hasOwn(parsed.data, control.id)) return null;
    const entry = parsed.data[control.id];
    if (control.kind === 'number') {
      if (
        typeof entry !== 'number' ||
        (control.min !== undefined && entry < control.min) ||
        (control.max !== undefined && entry > control.max)
      )
        return null;
    } else if (
      typeof entry !== 'string' ||
      (control.kind === 'color' && (entry.length > 512 || parseColor(entry) === null))
    )
      return null;
    if (control.options && !control.options.some((option) => option.value === entry)) return null;
  }
  return parsed.data;
}
