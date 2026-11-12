import type { EffectControlContext } from '@sniptale/runtime-contracts/effect-controls';
import { z } from 'zod';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import {
  validateEffectControlPresetValues,
  applyEffectControlPresetValues,
} from '@sniptale/runtime-contracts/effect-controls';

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
  const document = parseAnimationTemplateSource(source).template;
  const stored = parseStoredEffectPresetPreferences(input);
  if (
    !document ||
    !stored ||
    stored.presets.some((preset) => !validateEffectControlPresetValues(document, preset.values).ok)
  )
    return null;
  const choice = stored.defaultPreset;
  if (
    choice &&
    !(choice.kind === 'builtin' ? document.controlPresets : stored.presets)?.some(
      (item) => item.id === choice.id
    )
  )
    return null;
  return stored;
}

/** Structural persistence boundary retains presets whose definitions are temporarily unavailable. */
export function parseStoredEffectPresetPreferences(input: unknown): EffectPresetPreferences | null {
  if (!record(input) || !Array.isArray(input['presets']) || input['presets'].length > 16)
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
      Object.keys(preset['values']).length > 256 ||
      Object.values(preset['values']).some(
        (value) => typeof value === 'string' && value.length > 128
      )
    )
      return null;
    if (presets.some((item) => item.id === preset['id'])) return null;
    const values: Record<string, number | string> = {};
    for (const [key, value] of Object.entries(preset['values'])) {
      if (
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'number' && !Number.isFinite(value)) ||
        key.length > 128
      )
        return null;
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
  return { presets, defaultPreset: { kind: choice['kind'], id: choice['id'] } };
}

export function collectEffectVisualValues(
  document: EffectControlContext,
  controls: Readonly<Record<string, number | string>>
) {
  return Object.fromEntries(
    Object.entries(controls).filter(
      ([id, value]) => validateEffectControlPresetValues(document, { [id]: value }).ok
    )
  );
}

export function applyInitialEffectPreset(
  document: EffectControlContext,
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
  return applyEffectControlPresetValues(document, controls, preset.values);
}
function id(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface VisualCatalogDocumentPreference {
  sourceSha256: string;
  enabled?: boolean | undefined;
  presetPreferences?: EffectPresetPreferences | undefined;
}
export interface VisualCatalogPreference {
  format: 'sniptale-visual-preferences';
  version: 1;
  kind: 'animation' | 'transition';
  packId: string;
  enabled?: boolean | undefined;
  documents: Record<string, VisualCatalogDocumentPreference>;
}
const visualPreferenceSchema = z.strictObject({
  format: z.literal('sniptale-visual-preferences'),
  version: z.literal(1),
  kind: z.enum(['animation', 'transition']),
  packId: z.string().regex(/^(?:builtin:)?[A-Za-z0-9][A-Za-z0-9._@-]{0,191}$/),
  enabled: z.boolean().optional(),
  documents: z
    .record(
      z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/),
      z.strictObject({
        sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
        enabled: z.boolean().optional(),
        presetPreferences: z.unknown().optional(),
      })
    )
    .refine((value) => Object.keys(value).length <= 256),
});
/** Preference references remain data when their exact implementation is unavailable. */
export function parseVisualCatalogPreference(value: unknown): VisualCatalogPreference | null {
  try {
    if (JSON.stringify(value)?.length > 1024 * 1024) return null;
  } catch {
    return null;
  }
  const parsed = visualPreferenceSchema.safeParse(value);
  if (!parsed.success) return null;
  const documents: Record<string, VisualCatalogDocumentPreference> = {};
  for (const [id, reference] of Object.entries(parsed.data.documents)) {
    const presetPreferences =
      reference.presetPreferences === undefined
        ? undefined
        : parseStoredEffectPresetPreferences(reference.presetPreferences);
    if (presetPreferences === null) return null;
    Object.defineProperty(documents, id, {
      value: {
        sourceSha256: reference.sourceSha256,
        ...(reference.enabled === undefined ? {} : { enabled: reference.enabled }),
        ...(presetPreferences ? { presetPreferences } : {}),
      },
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return { ...parsed.data, documents };
}
export function resolveVisualCatalogDocumentPreference(
  identity: {
    kind: VisualCatalogPreference['kind'];
    packId: string;
    documentId: string;
    sourceSha256: string;
  },
  preferences: readonly VisualCatalogPreference[]
): {
  enabled: boolean;
  unavailable: boolean;
  presetPreferences?: EffectPresetPreferences | undefined;
} {
  const row = preferences.find(
    (row) => row.kind === identity.kind && row.packId === identity.packId
  );
  const reference = row?.documents[identity.documentId];
  if (!reference) return { enabled: true, unavailable: false };
  if (reference.sourceSha256 !== identity.sourceSha256) return { enabled: true, unavailable: true };
  return {
    enabled: reference.enabled ?? row?.enabled ?? true,
    unavailable: false,
    ...(reference.presetPreferences ? { presetPreferences: reference.presetPreferences } : {}),
  };
}
