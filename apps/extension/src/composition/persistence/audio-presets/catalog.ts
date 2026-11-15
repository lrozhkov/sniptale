import { z } from 'zod';
import {
  parseAudioProcessingPreset,
  AUDIO_PRESET_MAX_BYTES,
  type AudioProcessingPreset,
} from '@sniptale/runtime-contracts/audio-effects';

export const AUDIO_PRESET_STORAGE_KEY = 'sniptale_audio_presets';
const AUDIO_PRESET_CATALOG_MAX_ENTRIES = 100;
const AUDIO_PRESET_CATALOG_MAX_BYTES = 2 * 1024 * 1024;
const BUILTIN_AUDIO_PRESET_IDS = [
  'builtin:speech',
  'builtin:telephone',
  'builtin:echo',
  'builtin:room',
] as const;
export const AUDIO_PRESET_ID_MAX_LENGTH = 192;
const userId = z
  .string()
  .max(AUDIO_PRESET_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);
const reference = z.union([z.enum(BUILTIN_AUDIO_PRESET_IDS), userId]);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const preset = z.unknown().transform((value, context) => {
  const accepted = parseAudioProcessingPreset(value);
  if (
    !accepted ||
    new TextEncoder().encode(JSON.stringify(accepted)).byteLength > AUDIO_PRESET_MAX_BYTES
  ) {
    context.addIssue({ code: 'custom', message: 'Invalid source-only audio preset.' });
    return z.NEVER;
  }
  return accepted;
});
const preferences = z.strictObject({
  defaultId: reference.nullable(),
  disabledIds: z
    .array(reference)
    .max(AUDIO_PRESET_CATALOG_MAX_ENTRIES + BUILTIN_AUDIO_PRESET_IDS.length)
    .refine((ids) => new Set(ids).size === ids.length),
});
const stored = z
  .strictObject({
    id: userId,
    incarnation: z.uuid(),
    revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    createdAt: timestamp,
    updatedAt: timestamp,
    preset,
  })
  .refine((entry) => entry.updatedAt >= entry.createdAt);
const catalog = z.strictObject({
  version: z.literal(1),
  generation: z.uuid().nullable(),
  presets: z.array(stored).max(AUDIO_PRESET_CATALOG_MAX_ENTRIES),
  preferences,
});
const transferItem = z
  .strictObject({ id: userId, name: z.string(), preset })
  .refine((entry) => entry.name === entry.preset.name);
const transfer = z.strictObject({
  presets: z.array(transferItem).max(AUDIO_PRESET_CATALOG_MAX_ENTRIES).optional(),
  preferences: preferences.optional(),
});
export type AudioPresetCatalog = z.infer<typeof catalog>;
type AudioPresetTransfer = z.infer<typeof transfer>;

function boundedInventory(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  if (!('presets' in value)) return true;
  return Array.isArray(value.presets) && value.presets.length <= AUDIO_PRESET_CATALOG_MAX_ENTRIES;
}
function uniqueIds(entries: readonly { id: string }[]): boolean {
  return new Set(entries.map((entry) => entry.id)).size === entries.length;
}
/** Undefined storage is an empty read. Invalid or future data never becomes writable defaults. */
export function parseAudioPresetCatalog(value: unknown): AudioPresetCatalog | null {
  if (value === undefined)
    return {
      version: 1,
      generation: null,
      presets: [],
      preferences: { defaultId: null, disabledIds: [] },
    };
  if (!boundedInventory(value)) return null;
  const result = catalog.safeParse(value);
  if (!result.success) return null;
  const accepted = result.data;
  if (!uniqueIds(accepted.presets)) return null;
  if (
    accepted.generation === null &&
    (accepted.presets.length ||
      accepted.preferences.defaultId !== null ||
      accepted.preferences.disabledIds.length)
  )
    return null;
  const ids = new Set<string>([
    ...BUILTIN_AUDIO_PRESET_IDS,
    ...accepted.presets.map((entry) => entry.id),
  ]);
  if (
    accepted.preferences.disabledIds.some((id) => !ids.has(id)) ||
    (accepted.preferences.defaultId !== null &&
      (!ids.has(accepted.preferences.defaultId) ||
        accepted.preferences.disabledIds.includes(accepted.preferences.defaultId)))
  )
    return null;
  return new TextEncoder().encode(JSON.stringify(accepted)).byteLength <=
    AUDIO_PRESET_CATALOG_MAX_BYTES
    ? accepted
    : null;
}

/** Transfer is source data and separate preferences, without local write tokens or media bindings. */
export function parseAudioPresetTransfer(value: unknown): AudioPresetTransfer | null {
  if (!boundedInventory(value)) return null;
  const result = transfer.safeParse(value);
  if (!result.success || (result.data.presets && !uniqueIds(result.data.presets))) return null;
  return new TextEncoder().encode(JSON.stringify(result.data)).byteLength <=
    AUDIO_PRESET_CATALOG_MAX_BYTES
    ? result.data
    : null;
}
export function projectAudioPresetTransfer(value: AudioPresetCatalog): AudioPresetTransfer {
  return {
    presets: value.presets.map((entry) => ({
      id: entry.id,
      name: entry.preset.name,
      preset: structuredClone(entry.preset),
    })),
    preferences: structuredClone(value.preferences),
  };
}

/** The existing transfer planner has already resolved selection and conflicts before this projection. */
export function restoreAudioPresetCatalog(
  current: AudioPresetCatalog,
  value: unknown,
  createId: () => string = () => crypto.randomUUID(),
  now = Date.now()
): AudioPresetCatalog | null {
  const input = parseAudioPresetTransfer(value);
  if (!input) return null;
  return parseAudioPresetCatalog({
    version: 1,
    generation: createId(),
    presets:
      input.presets?.map((entry) => ({
        id: entry.id,
        preset: entry.preset,
        incarnation: createId(),
        revision: 1,
        createdAt: now,
        updatedAt: now,
      })) ?? current.presets,
    preferences: input.preferences ?? current.preferences,
  });
}

export function isBuiltinAudioPreset(id: string): boolean {
  return BUILTIN_AUDIO_PRESET_IDS.some((builtin) => builtin === id);
}
/** Names and processor values remain closed preset data after a rename. */
export function renameAudioPreset(
  value: AudioProcessingPreset,
  name: string
): AudioProcessingPreset | null {
  return parseAudioProcessingPreset({ ...value, name: name.trim() });
}
