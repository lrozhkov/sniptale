import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  GL_TRANSITION_PRESET_MAX_BYTES,
  GL_TRANSITIONS,
  createGlTransitionSelection,
  parseGlTransitionPresetJson,
} from '../../../features/video/project/transition/gl-catalog';
import {
  resolveVisualCatalogDocumentPreference,
  type VisualCatalogPreference,
} from '../../../features/video/project/effect-bundle/catalog/presets';
import {
  initDB,
  VIDEO_GL_TRANSITION_PRESETS_STORE,
  VIDEO_VISUAL_PREFERENCES_STORE,
} from '../infrastructure/indexed-db/core';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import {
  mutateVisualCatalogPreference,
  readVisualCatalogPreferences,
  runVisualCatalogMutation,
} from './preferences';
import { EffectBundlePersistenceError } from './errors';

export const GL_PRESET_CATALOG_MAX_ENTRIES = 256;
export const GL_PRESET_CATALOG_MAX_BYTES =
  GL_PRESET_CATALOG_MAX_ENTRIES * GL_TRANSITION_PRESET_MAX_BYTES;
const STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;
const BUILTIN_GL_PACK_ID = 'builtin:gl-transitions';
const entrySchema = z.strictObject({
  format: z.literal('sniptale-gl-preset-catalog'),
  version: z.literal(1),
  id: z.string().regex(/^gl\.[a-f0-9]{64}$/u),
  source: z.string().min(1).max(GL_TRANSITION_PRESET_MAX_BYTES),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  retainedByteLength: z.number().int().positive().max(GL_TRANSITION_PRESET_MAX_BYTES),
  createdAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  updatedAt: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
/** Archive headers retain the same closed identity and resource bounds. */
export const glPresetCatalogHeaderSchema = entrySchema.omit({ source: true });
export type GlPresetCatalogEntry = z.infer<typeof entrySchema>;
const sourceHash = (source: string) => bytesToHex(sha256(new TextEncoder().encode(source)));

/** Unknown implementations remain closed preset data. They cannot become executable selections. */
export function parseGlPresetCatalogEntry(value: unknown): GlPresetCatalogEntry | null {
  const result = entrySchema.safeParse(value);
  if (!result.success) return null;
  const entry = result.data;
  if (
    entry.id !== `gl.${entry.sourceSha256}` ||
    new TextEncoder().encode(entry.source).byteLength !== entry.retainedByteLength ||
    sourceHash(entry.source) !== entry.sourceSha256
  )
    return null;
  const preset = parseGlTransitionPresetJson(entry.source);
  return preset.ok || preset.code === 'unsupported' ? entry : null;
}
function requireEntry(value: unknown): GlPresetCatalogEntry {
  const entry = parseGlPresetCatalogEntry(value);
  if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  return entry;
}
function requireInventory(value: unknown): GlPresetCatalogEntry[] {
  if (!Array.isArray(value)) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  const entries = value.map(requireEntry);
  if (
    entries.length > GL_PRESET_CATALOG_MAX_ENTRIES ||
    entries.reduce((sum, entry) => sum + entry.retainedByteLength, 0) > GL_PRESET_CATALOG_MAX_BYTES
  )
    throw new EffectBundlePersistenceError('catalogQuotaExceeded');
  return entries;
}
function assertItemId(id: string) {
  if (!/^gl\.[a-f0-9]{64}$/u.test(id))
    throw new EffectBundlePersistenceError('catalogEntryInvalid');
}

/** Return immutable source records; availability has one separate authority. */
export async function listGlPresetCatalogEntries(
  permit?: PersistenceMutationPermit
): Promise<GlPresetCatalogEntry[]> {
  const db = await initDB(permit);
  return requireInventory(await db.getAll(VIDEO_GL_TRANSITION_PRESETS_STORE)).sort(
    (a, b) => b.updatedAt - a.updatedAt
  );
}
export async function getGlPresetCatalogEntry(
  id: string,
  permit?: PersistenceMutationPermit
): Promise<GlPresetCatalogEntry | null> {
  assertItemId(id);
  const db = await initDB(permit),
    value: unknown = await db.get(VIDEO_GL_TRANSITION_PRESETS_STORE, id);
  return value === undefined ? null : requireEntry(value);
}

/** Save exact admitted file bytes, including unsupported pinned references, without importing shader code. */
export async function saveGlPresetCatalogSource(
  source: unknown,
  now = Date.now(),
  permit?: PersistenceMutationPermit,
  signal?: AbortSignal
): Promise<GlPresetCatalogEntry> {
  return runVisualCatalogMutation(async (activePermit) => {
    signal?.throwIfAborted();
    if (
      typeof source !== 'string' ||
      !source.length ||
      source.length > GL_TRANSITION_PRESET_MAX_BYTES ||
      new TextEncoder().encode(source).byteLength > GL_TRANSITION_PRESET_MAX_BYTES
    )
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    const hash = sourceHash(source);
    const draft = requireEntry({
      format: 'sniptale-gl-preset-catalog',
      version: 1,
      id: `gl.${hash}`,
      source,
      sourceSha256: hash,
      retainedByteLength: new TextEncoder().encode(source).byteLength,
      createdAt: now,
      updatedAt: now,
    });
    const db = await initDB(activePermit);
    const estimate =
      typeof navigator === 'undefined'
        ? undefined
        : await navigator.storage?.estimate?.().catch(() => undefined);
    signal?.throwIfAborted();
    const tx = db.transaction(VIDEO_GL_TRANSITION_PRESETS_STORE, 'readwrite');
    try {
      const entries = requireInventory(await tx.store.getAll());
      const previous = entries.find((entry) => entry.id === draft.id);
      if (!previous && entries.length >= GL_PRESET_CATALOG_MAX_ENTRIES)
        throw new EffectBundlePersistenceError('catalogQuotaExceeded');
      const retained = entries.reduce((sum, entry) => sum + entry.retainedByteLength, 0);
      const growth = previous ? 0 : draft.retainedByteLength;
      if (
        retained + growth > GL_PRESET_CATALOG_MAX_BYTES ||
        (estimate?.quota !== undefined &&
          estimate.usage !== undefined &&
          estimate.usage + growth + STORAGE_HEADROOM_BYTES > estimate.quota)
      )
        throw new EffectBundlePersistenceError('catalogQuotaExceeded');
      const entry = { ...draft, createdAt: previous?.createdAt ?? draft.createdAt };
      signal?.throwIfAborted();
      await tx.store.put(entry);
      await tx.done;
      return entry;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failed native request can already have aborted it. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }, permit);
}

/** Hold command authority from the first file read through publication, so later deletion stays final. */
export async function importGlPresetCatalogFile(
  file: File,
  signal?: AbortSignal
): Promise<GlPresetCatalogEntry> {
  return runVisualCatalogMutation(async (permit) => {
    signal?.throwIfAborted();
    if (!file.size || file.size > GL_TRANSITION_PRESET_MAX_BYTES)
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    const bytes = await file.arrayBuffer();
    signal?.throwIfAborted();
    if (bytes.byteLength > GL_TRANSITION_PRESET_MAX_BYTES)
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    return saveGlPresetCatalogSource(
      new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      Date.now(),
      permit,
      signal
    );
  });
}

/** Delete source and preference in the same transaction; project selections and other resources remain. */
export async function deleteGlPresetCatalogEntry(id: string): Promise<void> {
  assertItemId(id);
  return runVisualCatalogMutation(async (permit) => {
    const db = await initDB(permit);
    const tx = db.transaction(
      [VIDEO_GL_TRANSITION_PRESETS_STORE, VIDEO_VISUAL_PREFERENCES_STORE],
      'readwrite'
    );
    try {
      await tx.objectStore(VIDEO_GL_TRANSITION_PRESETS_STORE).delete(id);
      await tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE).delete(['transition', id]);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* A failed native request can already have aborted it. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

/** Project display and availability from the retained source. Unsupported data has no apply selection. */
export function resolveGlPresetCatalogEntry(
  entry: GlPresetCatalogEntry,
  preferences: readonly VisualCatalogPreference[]
) {
  entry = requireEntry(entry);
  const preset = parseGlTransitionPresetJson(entry.source);
  if (!preset.ok && preset.code !== 'unsupported')
    throw new EffectBundlePersistenceError('catalogEntryInvalid');
  const name = preset.ok ? preset.preset.name : preset.name;
  const transitionName = preset.ok ? preset.preset.transition.name : preset.transitionName;
  const preference = resolveVisualCatalogDocumentPreference(
    {
      kind: 'transition',
      packId: entry.id,
      documentId: transitionName,
      sourceSha256: entry.sourceSha256,
    },
    preferences
  );
  const base = { entry, name, transitionName, enabled: preference.enabled };
  return preset.ok
    ? { ...base, status: 'ready' as const, selection: preset.preset.transition }
    : { ...base, status: 'unsupported' as const };
}
async function writeAvailability(
  packId: string,
  documentId: string,
  hash: string,
  enabled: boolean,
  permit: PersistenceMutationPermit
) {
  await mutateVisualCatalogPreference(
    'transition',
    packId,
    (current) => {
      const previous = current?.documents[documentId];
      if (previous && previous.sourceSha256 !== hash) throw new Error('GL preset source changed');
      return {
        ...current,
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'transition',
        packId,
        documents: {
          ...current?.documents,
          [documentId]: { ...previous, sourceSha256: hash, enabled },
        },
      };
    },
    permit
  );
}
export async function setGlPresetCatalogEnabled(id: string, enabled: boolean): Promise<void> {
  return runVisualCatalogMutation(async (permit) => {
    const entry = await getGlPresetCatalogEntry(id, permit);
    if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
    const view = resolveGlPresetCatalogEntry(entry, []);
    await writeAvailability(id, view.transitionName, entry.sourceSha256, enabled, permit);
  });
}
function builtinIdentity(name: string) {
  const selection = createGlTransitionSelection(name);
  if (!selection) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  return sourceHash(
    JSON.stringify({
      name,
      version: selection.version,
      adapter: selection.adapter,
      wgslSha256: selection.wgslSha256,
      glsl3Sha256: selection.glsl3Sha256,
    })
  );
}
/** Catalogue availability never changes the pinned implementation or parameters of applied project transitions. */
export async function listBuiltinGlTransitionAvailability(permit?: PersistenceMutationPermit) {
  const preferences = await readVisualCatalogPreferences(permit);
  return GL_TRANSITIONS.map((transition) => ({
    transition,
    ...resolveVisualCatalogDocumentPreference(
      {
        kind: 'transition',
        packId: BUILTIN_GL_PACK_ID,
        documentId: transition.name,
        sourceSha256: builtinIdentity(transition.name),
      },
      preferences
    ),
  }));
}
export async function setBuiltinGlTransitionEnabled(name: string, enabled: boolean): Promise<void> {
  const hash = builtinIdentity(name);
  return runVisualCatalogMutation((permit) =>
    writeAvailability(BUILTIN_GL_PACK_ID, name, hash, enabled, permit)
  );
}
