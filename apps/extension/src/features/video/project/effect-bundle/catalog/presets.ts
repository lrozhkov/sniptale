import {
  parseEffectV1Source,
  validateEffectV1ControlPresetValues,
  applyEffectV1ControlPresetValues,
  type EffectV1Document,
} from '@sniptale/runtime-contracts/effect-v1';

interface EffectUserPreset {
  id: string;
  name: string;
  values: Record<string, number | string>;
}
export interface EffectPresetPreferences {
  presets: EffectUserPreset[];
  defaultPreset?: { kind: 'builtin' | 'user'; id: string };
}
export const EFFECT_CATALOG_CHANGED_EVENT = 'sniptale-effect-catalog-changed';

/** User values have the same protected-field boundary as SDK styles, with a bounded settings inventory. */
export function parseEffectPresetPreferences(
  source: string,
  input: unknown
): EffectPresetPreferences | null {
  const document = parseEffectV1Source(source).document;
  if (
    !document ||
    !record(input) ||
    !Array.isArray(input['presets']) ||
    input['presets'].length > 16
  )
    return null;
  const presets: EffectUserPreset[] = [];
  for (const preset of input['presets']) {
    if (
      !record(preset) ||
      !id(preset['id']) ||
      typeof preset['name'] !== 'string' ||
      !preset['name'].trim() ||
      preset['name'].length > 120 ||
      !record(preset['values']) ||
      Object.values(preset['values']).some(
        (value) => typeof value === 'string' && value.length > 128
      ) ||
      !validateEffectV1ControlPresetValues(document, preset['values']).ok
    )
      return null;
    if (presets.some((item) => item.id === preset['id'])) return null;
    const values: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(preset['values'])) {
      if (typeof value !== 'number' && typeof value !== 'string') return null;
      values[key] = value;
    }
    presets.push({
      id: preset['id'],
      name: preset['name'],
      values,
    });
  }
  const choice = input['defaultPreset'];
  if (choice === undefined) return { presets };
  if (
    !record(choice) ||
    !id(choice['id']) ||
    (choice['kind'] !== 'builtin' && choice['kind'] !== 'user')
  )
    return null;
  if (
    !(choice['kind'] === 'builtin' ? document.controlPresets : presets)?.some(
      (item) => item.id === choice['id']
    )
  )
    return null;
  return { presets, defaultPreset: { kind: choice['kind'], id: choice['id'] } };
}

export function collectEffectVisualValues(
  document: EffectV1Document,
  controls: Readonly<Record<string, number | string>>
) {
  return Object.fromEntries(
    Object.entries(controls).filter(
      ([id, value]) => validateEffectV1ControlPresetValues(document, { [id]: value }).ok
    )
  );
}

export function applyInitialEffectPreset(
  document: EffectV1Document,
  controls: Record<string, number | string>,
  preferences?: EffectPresetPreferences,
  explicitId?: string
) {
  const choice = explicitId
    ? {
        kind: explicitId.startsWith('user:') ? 'user' : 'builtin',
        id: explicitId.replace(/^user:/, ''),
      }
    : preferences?.defaultPreset;
  const presetId = choice?.id ?? document.defaultControlPresetId;
  if (!presetId) return controls;
  const preset =
    choice?.kind === 'user'
      ? preferences?.presets.find((item) => item.id === presetId)
      : document.controlPresets?.find((item) => item.id === presetId);
  if (!preset) throw new Error('Unknown effect preset');
  return applyEffectV1ControlPresetValues(document, controls, preset.values);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
