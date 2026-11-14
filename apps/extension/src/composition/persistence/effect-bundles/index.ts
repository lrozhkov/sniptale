import { VIDEO_VISUAL_PREFERENCES_STORE } from '../infrastructure/indexed-db/core';
import {
  runVisualCatalogMutation,
  admitVisualCatalogPreferences,
  readVisualCatalogPreferences,
  mutateVisualCatalogPreference,
  overlayVisualAnimationPreferences,
} from './preferences';
import { parseVisualCatalogPreference } from '../../../features/video/project/effect-bundle/catalog/presets';
import { VIDEO_ANIMATION_PACKAGES_STORE } from '../infrastructure/indexed-db/core';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { AnimationArtifactImportResult } from '../../../features/video/project/effect-bundle/lottie-profile';
import { parseAnimationTemplateSource } from '@sniptale/runtime-contracts/animation-template';
import { validateEffectControlPresetValues } from '@sniptale/runtime-contracts/effect-controls';
import { parseStoredAnimationCatalogEntry } from './entry';
import { assertAnimationCatalogIntegrity } from './integrity';
import { createAnimationCatalogEntry } from './catalog-builder';
import {
  createBuiltinEffectResources,
  readBuiltinEffectResource,
  BUILTIN_EFFECT_PREFIX,
} from './builtin';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import { initDB } from '../infrastructure/indexed-db/core';
import type {
  EffectBundleCatalogEntry,
  EffectBundleCatalogListItem,
} from '../../../features/video/project/effect-bundle/catalog';
import { EffectBundlePersistenceError } from './errors';

export { EffectBundlePersistenceError } from './errors';

export const EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT = 512 * 1024 * 1024;
const STORAGE_HEADROOM_BYTES = 64 * 1024 * 1024;

/** Catalogue consumers receive a disposable view; only source-only packages are durable. */
function animationCatalogView(entry: AnimationCatalogEntry): EffectBundleCatalogEntry {
  return {
    packId: entry.packId,
    source: entry.source,
    version: String(entry.version),
    sourceSha256: entry.sourceSha256,
    label: { en: entry.label.en, ru: entry.label.ru ?? entry.label.en },
    description: {
      en: entry.description?.en ?? '',
      ru: entry.description?.ru ?? entry.description?.en ?? '',
    },
    assets: [],
    enabled: true,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    retainedByteLength: entry.retainedByteLength,
    documents: entry.documents.map((document) => ({
      ...document,
      schemaVersion: 'sniptale.animation.v1',
      kind: 'standalone',
      assets: [],
    })),
  };
}
function catalogSummary(entry: EffectBundleCatalogEntry): EffectBundleCatalogListItem {
  return {
    createdAt: entry.createdAt,
    documentKinds: entry.documents.map((document) => document.kind),
    enabled: entry.enabled,
    entry,
    label: entry.label,
    packId: entry.packId,
    retainedByteLength: entry.retainedByteLength,
    source: entry.source,
    status: 'ready',
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}
export async function listImportedEffectBundles(
  permit?: PersistenceMutationPermit
): Promise<EffectBundleCatalogListItem[]> {
  const db = await initDB(permit),
    values: unknown = await db.getAll(VIDEO_ANIMATION_PACKAGES_STORE);
  if (!Array.isArray(values)) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  const preferences = await readVisualCatalogPreferences(permit),
    summaries: EffectBundleCatalogListItem[] = [];
  for (const value of values) {
    const entry = parseStoredAnimationCatalogEntry(value);
    if (!entry) {
      summaries.push({ packId: readOpaquePackId(value), status: 'invalid' });
      continue;
    }
    try {
      await assertAnimationCatalogIntegrity(entry);
      summaries.push(
        catalogSummary(overlayVisualAnimationPreferences(animationCatalogView(entry), preferences))
      );
    } catch {
      summaries.push({ packId: entry.packId, status: 'invalid' });
    }
  }
  return summaries.sort((left, right) =>
    left.status === 'ready' && right.status === 'ready' ? right.updatedAt - left.updatedAt : 0
  );
}
const builtinResources = createBuiltinEffectResources(readBuiltinEffectResource);
export async function listEffectBundles(
  permit?: PersistenceMutationPermit
): Promise<EffectBundleCatalogListItem[]> {
  const [imported, builtin, preferences] = await Promise.all([
    listImportedEffectBundles(permit),
    builtinResources.load(),
    readVisualCatalogPreferences(permit),
  ]);
  return [catalogSummary(overlayVisualAnimationPreferences(builtin, preferences)), ...imported];
}
export async function getEffectBundle(
  packId: string,
  permit?: PersistenceMutationPermit
): Promise<EffectBundleCatalogEntry | null> {
  const preferences = await readVisualCatalogPreferences(permit);
  if (packId.startsWith(BUILTIN_EFFECT_PREFIX)) {
    const builtin = await builtinResources.load();
    return builtin.packId === packId
      ? overlayVisualAnimationPreferences(builtin, preferences)
      : null;
  }
  const entry = await getAnimationCatalogEntry(packId, permit);
  return entry ? overlayVisualAnimationPreferences(animationCatalogView(entry), preferences) : null;
}
export function deleteEffectBundle(packId: string): Promise<void> {
  return deleteAnimationCatalogEntry(packId);
}
/** Availability commands serialize their source read with import/delete and retain sibling preferences. */
export async function setEffectBundleEnabled(packId: string, enabled: boolean): Promise<void> {
  return runVisualCatalogMutation(async (permit) => {
    const catalog = await getEffectBundle(packId, permit);
    if (!catalog) return;
    await updateCatalogAvailability(catalog, catalog.documents, enabled, permit);
  });
}
export async function setEffectDocumentEnabled(
  packId: string,
  documentId: string,
  enabled: boolean
): Promise<void> {
  return runVisualCatalogMutation(async (permit) => {
    const catalog = await getEffectBundle(packId, permit),
      document = catalog?.documents.find((document) => document.id === documentId);
    if (!catalog || !document) throw new EffectBundlePersistenceError('catalogEntryInvalid');
    await updateCatalogAvailability(catalog, [document], enabled, permit);
  });
}
async function updateCatalogAvailability(
  catalog: EffectBundleCatalogEntry,
  selected: EffectBundleCatalogEntry['documents'],
  enabled: boolean,
  permit: PersistenceMutationPermit
) {
  await mutateVisualCatalogPreference(
    'animation',
    catalog.packId,
    (current) => {
      const documents = { ...current?.documents };
      for (const document of selected) {
        const previous = documents[document.id];
        if (previous && previous.sourceSha256 !== document.sha256)
          throw new Error('Effect catalog changed');
        documents[document.id] = { ...previous, sourceSha256: document.sha256, enabled };
      }
      return {
        ...current,
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'animation',
        packId: catalog.packId,
        documents,
      };
    },
    permit
  );
}

function assertStorageHeadroom(
  nextRetainedBytes: number,
  currentRetainedBytes: number,
  estimate: StorageEstimate | undefined
): void {
  if (nextRetainedBytes > EFFECT_BUNDLE_CATALOG_RETAINED_BYTES_LIMIT) {
    throw new EffectBundlePersistenceError('catalogQuotaExceeded');
  }
  if (
    estimate?.quota !== undefined &&
    estimate.usage !== undefined &&
    estimate.usage +
      Math.max(0, nextRetainedBytes - currentRetainedBytes) +
      STORAGE_HEADROOM_BYTES >
      estimate.quota
  ) {
    throw new EffectBundlePersistenceError('catalogQuotaExceeded');
  }
}

async function readStorageEstimate(): Promise<StorageEstimate | undefined> {
  return typeof navigator === 'undefined'
    ? undefined
    : navigator.storage?.estimate?.().catch(() => undefined);
}

function readOpaquePackId(value: unknown): string {
  return isUnknownRecord(value) && typeof value['packId'] === 'string'
    ? value['packId'].slice(0, 128)
    : 'invalid';
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Import admission owns validation and publication, including every asynchronous preparation step. */
export async function saveAnimationArtifact(
  artifact: Extract<AnimationArtifactImportResult, { ok: true }>,
  now = Date.now(),
  permit?: PersistenceMutationPermit,
  signal?: AbortSignal
): Promise<{ entry: AnimationCatalogEntry; unavailablePreferences: string[] }> {
  return runVisualCatalogMutation(async (activePermit) => {
    signal?.throwIfAborted();
    const db = await initDB(activePermit),
      draft = await createAnimationCatalogEntry(artifact, now);
    const existingValue: unknown = await db.get(VIDEO_ANIMATION_PACKAGES_STORE, draft.packId);
    const existing =
      existingValue === undefined ? null : parseStoredAnimationCatalogEntry(existingValue);
    if (existingValue !== undefined && !existing)
      throw new EffectBundlePersistenceError('catalogEntryInvalid');
    if (existing) await assertAnimationCatalogIntegrity(existing);
    const rawPreference: unknown = await db.get(VIDEO_VISUAL_PREFERENCES_STORE, [
      'animation',
      draft.packId,
    ]);
    const previousPreference =
      rawPreference === undefined ? undefined : parseVisualCatalogPreference(rawPreference);
    if (previousPreference === null) throw new EffectBundlePersistenceError('catalogEntryInvalid');
    const nextPreference = previousPreference ? structuredClone(previousPreference) : undefined;
    const unavailablePreferences: string[] = [];
    for (const document of draft.documents) {
      const previous = existing?.documents.find((item) => item.id === document.id);
      const reference = nextPreference?.documents[document.id];
      if (!reference) continue;
      const currentTemplate = parseAnimationTemplateSource(document.source);
      const previousTemplate = previous && parseAnimationTemplateSource(previous.source);
      const preferences = reference.presetPreferences;
      const compatible =
        document.sha256 === reference.sourceSha256 ||
        (previous?.sha256 === reference.sourceSha256 &&
          currentTemplate.ok &&
          previousTemplate?.ok &&
          JSON.stringify(currentTemplate.template.bindings) ===
            JSON.stringify(previousTemplate.template.bindings) &&
          JSON.stringify(
            currentTemplate.template.controls.map((control) => [control.id, control.kind])
          ) ===
            JSON.stringify(
              previousTemplate.template.controls.map((control) => [control.id, control.kind])
            ) &&
          (!preferences ||
            (preferences.presets.every(
              (preset) =>
                validateEffectControlPresetValues(currentTemplate.template, preset.values).ok
            ) &&
              (!preferences.defaultPreset ||
                (preferences.defaultPreset.kind === 'builtin'
                  ? currentTemplate.template.controlPresets
                  : preferences.presets
                )?.some((preset) => preset.id === preferences.defaultPreset?.id)))));
      if (compatible) reference.sourceSha256 = document.sha256;
      else unavailablePreferences.push(document.id);
    }
    const entry = { ...draft, createdAt: existing?.createdAt ?? draft.createdAt };
    const estimate = await readStorageEstimate(),
      tx = db.transaction(
        [VIDEO_ANIMATION_PACKAGES_STORE, VIDEO_VISUAL_PREFERENCES_STORE],
        'readwrite'
      );
    try {
      const store = tx.objectStore(VIDEO_ANIMATION_PACKAGES_STORE);
      const values: unknown = await store.getAll();
      if (!Array.isArray(values)) throw new EffectBundlePersistenceError('catalogEntryInvalid');
      let retained = 0;
      for (const value of values) {
        const parsed = parseStoredAnimationCatalogEntry(value);
        if (!parsed) throw new EffectBundlePersistenceError('catalogEntryInvalid');
        retained += parsed.retainedByteLength;
      }
      assertStorageHeadroom(
        retained - (existing?.retainedByteLength ?? 0) + entry.retainedByteLength,
        retained,
        estimate
      );
      if (nextPreference) {
        const preferenceStore = tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE);
        const allPreferences: unknown = await preferenceStore.getAll();
        if (!Array.isArray(allPreferences))
          throw new EffectBundlePersistenceError('catalogEntryInvalid');
        const preferenceRows: unknown[] = allPreferences;
        admitVisualCatalogPreferences([
          ...preferenceRows.filter(
            (row) =>
              !isUnknownRecord(row) || row['kind'] !== 'animation' || row['packId'] !== draft.packId
          ),
          nextPreference,
        ]);
        await preferenceStore.put(nextPreference);
      }
      signal?.throwIfAborted();
      await store.put(entry);
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
    return { entry: structuredClone(entry), unavailablePreferences };
  }, permit);
}

/** Read only the new namespace. Old package bytes are never interpreted as animations. */
export async function getAnimationCatalogEntry(
  packId: string,
  permit?: PersistenceMutationPermit
): Promise<AnimationCatalogEntry | null> {
  const db = await initDB(permit);
  const value: unknown = await db.get(VIDEO_ANIMATION_PACKAGES_STORE, packId);
  if (value === undefined) return null;
  const entry = parseStoredAnimationCatalogEntry(value);
  if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  await assertAnimationCatalogIntegrity(entry);
  return entry;
}

/** A malformed new row is reported explicitly; unrelated legacy rows do not block this catalog. */
export async function listAnimationCatalogEntries(
  permit?: PersistenceMutationPermit
): Promise<AnimationCatalogEntry[]> {
  const db = await initDB(permit);
  const values: unknown = await db.getAll(VIDEO_ANIMATION_PACKAGES_STORE);
  if (!Array.isArray(values)) throw new EffectBundlePersistenceError('catalogEntryInvalid');
  const entries: AnimationCatalogEntry[] = [];
  for (const value of values) {
    const entry = parseStoredAnimationCatalogEntry(value);
    if (!entry) throw new EffectBundlePersistenceError('catalogEntryInvalid');
    await assertAnimationCatalogIntegrity(entry);
    entries.push(entry);
  }
  return entries.sort((left, right) => right.updatedAt - left.updatedAt);
}

/** Package bytes and imported preferences share one atomic deletion. */
export async function deleteAnimationCatalogEntry(packId: string): Promise<void> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(packId))
    throw new EffectBundlePersistenceError('catalogEntryInvalid');
  return runVisualCatalogMutation(async (permit) => {
    const db = await initDB(permit),
      tx = db.transaction(
        [VIDEO_ANIMATION_PACKAGES_STORE, VIDEO_VISUAL_PREFERENCES_STORE],
        'readwrite'
      );
    try {
      await tx.objectStore(VIDEO_ANIMATION_PACKAGES_STORE).delete(packId);
      await tx.objectStore(VIDEO_VISUAL_PREFERENCES_STORE).delete(['animation', packId]);
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
