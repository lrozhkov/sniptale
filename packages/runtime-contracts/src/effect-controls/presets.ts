import { parseColor } from '@sniptale/foundation/color';
import { isPlainRecord } from '../validation/primitives.js';
import { resolveEffectControlGroup } from './presentation.js';
import type { EffectControlContext } from './types.js';

const VISUAL_GROUPS = new Set(['appearance', 'typography', 'processing', 'animation']);

/** Check visual overrides without changing text, anchors or accepted control values. */
export function validateEffectControlPresetValues(document: EffectControlContext, values: unknown) {
  const diagnostics: { code: string; path: string; message: string }[] = [];
  const error = (code: string, id: string, message: string) =>
    diagnostics.push({ code, path: `$.values.${id}`, message });
  const parsed: Record<string, number | string> = {};
  if (
    !isPlainRecord(values) ||
    Object.keys(values).length < 1 ||
    Object.keys(values).length > 256
  ) {
    error('CONTROL_PRESET_VALUES', '', 'Use 1–256 visual control overrides.');
    return { ok: false, diagnostics, values: parsed };
  }
  const controls = new Map(document.controls.map((control) => [control.id, control]));
  const protectedIds = new Set(
    document.objectLayout?.handles?.flatMap((handle) => [handle.xControl, handle.yControl])
  );
  for (const [id, value] of Object.entries(values)) {
    const control = controls.get(id);
    if (!control || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(id)) {
      error('CONTROL_PRESET_CONTROL', id, 'Use a declared control.');
      continue;
    }
    const group = resolveEffectControlGroup(control.group, document.controlGroups);
    if (
      control.kind === 'text' ||
      group === null ||
      !VISUAL_GROUPS.has(group) ||
      protectedIds.has(id)
    ) {
      error('CONTROL_PRESET_PROTECTED', id, 'Preserve text, geometry and anchor controls.');
      continue;
    }
    const valid =
      control.kind === 'number'
        ? typeof value === 'number' &&
          Number.isFinite(value) &&
          (control.min === undefined || value >= control.min) &&
          (control.max === undefined || value <= control.max)
        : typeof value === 'string' && value.length <= 512 && parseColor(value) !== null;
    if (!valid || (typeof value !== 'number' && typeof value !== 'string')) {
      error('CONTROL_PRESET_VALUE', id, 'Use a valid control value within its range.');
      continue;
    }
    if (control.options && !control.options.some((option) => option.value === value)) {
      error('CONTROL_PRESET_OPTION', id, 'Use a declared option value.');
      continue;
    }
    Object.defineProperty(parsed, id, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { ok: diagnostics.length === 0, diagnostics, values: parsed };
}

/** Apply only validated overrides; missing stored values are not initialized. */
export function applyEffectControlPresetValues(
  document: EffectControlContext,
  current: Readonly<Record<string, number | string>>,
  values: unknown
): Record<string, number | string> {
  const result = validateEffectControlPresetValues(document, values);
  if (!result.ok)
    throw new Error(result.diagnostics.map((item) => `${item.code}: ${item.path}`).join('; '));
  return { ...current, ...result.values };
}

/** Select a named preset from the immutable control snapshot. */
export function applyEffectControlPreset(
  document: EffectControlContext,
  current: Readonly<Record<string, number | string>>,
  presetId: string
): Record<string, number | string> {
  const preset = document.controlPresets?.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown control preset: ${presetId}`);
  return applyEffectControlPresetValues(document, current, preset.values);
}
