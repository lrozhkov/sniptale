import type { EffectV1Document } from './types.js';
import { inspectControlPresetValues } from '../validation/control-presets.js';

/** Validate persisted or user-authored visual overrides against a validated document. */
export function validateEffectV1ControlPresetValues(document: EffectV1Document, values: unknown) {
  const diagnostics: { code: string; path: string; message: string }[] = [];
  inspectControlPresetValues(document, values, '$.values', {
    warning() {},
    error(code, path, message) {
      diagnostics.push({ code, path, message });
    },
  });
  return { ok: diagnostics.length === 0, diagnostics };
}

/** Merge only validated visual overrides; never initialize missing instance controls. */
export function applyEffectV1ControlPresetValues(
  document: EffectV1Document,
  current: Readonly<Record<string, string | number>>,
  values: unknown
): Record<string, string | number> {
  const result = validateEffectV1ControlPresetValues(document, values);
  if (!result.ok) throw new Error(result.diagnostics.map((d) => `${d.code}: ${d.path}`).join('; '));
  return { ...current, ...(values as Record<string, string | number>) };
}

/** Apply a named visual preset without resetting instance text or geometry. */
export function applyEffectV1ControlPreset(
  document: EffectV1Document,
  current: Readonly<Record<string, string | number>>,
  presetId: string
): Record<string, string | number> {
  const preset = document.controlPresets?.find((item) => item.id === presetId);
  if (!preset) throw new Error(`Unknown control preset: ${presetId}`);
  return applyEffectV1ControlPresetValues(document, current, preset.values);
}
