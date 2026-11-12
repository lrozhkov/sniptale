import { initDB, VIDEO_VISUAL_PREFERENCES_STORE } from '../infrastructure/indexed-db/core';
import {
  runWithPersistenceDomainMutationLock,
  isActivePersistenceMutationPermit,
} from '../infrastructure/mutation-barrier';
import {
  parseVisualCatalogPreference,
  resolveVisualCatalogDocumentPreference,
  type VisualCatalogPreference,
} from '../../../features/video/project/effect-bundle/catalog/presets';
import type { PersistenceMutationPermit } from '../infrastructure/mutation-barrier';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';

export function runVisualCatalogMutation<T>(
  operation: (permit: PersistenceMutationPermit) => T | Promise<T>,
  permit?: PersistenceMutationPermit
): Promise<T> {
  if (permit !== undefined) {
    if (!isActivePersistenceMutationPermit(permit))
      return Promise.reject(new Error('Visual catalog mutation permit is no longer active.'));
    return Promise.resolve().then(() => operation(permit));
  }
  return runWithPersistenceDomainMutationLock('animation-catalog', operation);
}
export function admitVisualCatalogPreferences(value: unknown): VisualCatalogPreference[] {
  if (!Array.isArray(value) || value.length > 256 || JSON.stringify(value).length > 1024 * 1024)
    throw new Error('Visual preferences quota exceeded.');
  const result: VisualCatalogPreference[] = [],
    ids = new Set<string>();
  for (const row of value) {
    const parsed = parseVisualCatalogPreference(row);
    if (!parsed || ids.has(`${parsed.kind}:${parsed.packId}`))
      throw new Error('Invalid visual catalog preferences.');
    ids.add(`${parsed.kind}:${parsed.packId}`);
    result.push(parsed);
  }
  return result;
}
export async function readVisualCatalogPreferences(
  permit?: PersistenceMutationPermit
): Promise<VisualCatalogPreference[]> {
  const db = await initDB(permit);
  const rows: unknown = await db.getAll(VIDEO_VISUAL_PREFERENCES_STORE);
  return admitVisualCatalogPreferences(rows);
}
/** Settings restore supplies a complete admitted set and owns the exclusive workflow permit. */
export async function replaceVisualCatalogPreferences(
  value: unknown,
  permit: PersistenceMutationPermit
): Promise<void> {
  const rows = admitVisualCatalogPreferences(value);
  if (!isActivePersistenceMutationPermit(permit))
    throw new Error('Visual catalog mutation permit is no longer active.');
  const db = await initDB(permit),
    tx = db.transaction(VIDEO_VISUAL_PREFERENCES_STORE, 'readwrite');
  try {
    const current = admitVisualCatalogPreferences(await tx.store.getAll());
    const nextKeys = new Set(rows.map((row) => `${row.kind}:${row.packId}`));
    for (const row of current)
      if (!nextKeys.has(`${row.kind}:${row.packId}`)) await tx.store.delete([row.kind, row.packId]);
    for (const row of rows) {
      const previous = current.find((item) => item.kind === row.kind && item.packId === row.packId);
      if (JSON.stringify(previous) !== JSON.stringify(row)) await tx.store.put(row);
    }
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
}
export async function mutateVisualCatalogPreference(
  kind: VisualCatalogPreference['kind'],
  packId: string,
  update: (current: VisualCatalogPreference | undefined) => VisualCatalogPreference,
  permit?: PersistenceMutationPermit
): Promise<void> {
  return runVisualCatalogMutation(async (activePermit) => {
    const db = await initDB(activePermit);
    const previous: unknown = await db.get(VIDEO_VISUAL_PREFERENCES_STORE, [kind, packId]);
    const current = previous === undefined ? undefined : parseVisualCatalogPreference(previous);
    if (current === null) throw new Error('Invalid visual catalog preferences.');
    const next = parseVisualCatalogPreference(update(current));
    if (!next || next.kind !== kind || next.packId !== packId)
      throw new Error('Visual preference identity changed.');
    const tx = db.transaction(VIDEO_VISUAL_PREFERENCES_STORE, 'readwrite');
    try {
      const rows: unknown = await tx.store.getAll();
      if (!Array.isArray(rows)) throw new Error('Invalid visual catalog preferences.');
      const preferenceRows: unknown[] = rows;
      admitVisualCatalogPreferences([
        ...preferenceRows.filter(
          (row) => !record(row) || row['kind'] !== kind || row['packId'] !== packId
        ),
        next,
      ]);
      await tx.store.put(next);
      await tx.done;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* The native transaction can already be aborted. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  }, permit);
}

/** Resolve disposable catalogue presentation from exact package/document digests, never legacy preferences. */
export function overlayVisualAnimationPreferences(
  entry: EffectBundleCatalogEntry,
  preferences: readonly VisualCatalogPreference[]
): EffectBundleCatalogEntry {
  const documents = entry.documents.map((document) => {
    const resolved = resolveVisualCatalogDocumentPreference(
      {
        kind: 'animation',
        packId: entry.packId,
        documentId: document.id,
        sourceSha256: document.sha256,
      },
      preferences
    );
    return {
      ...document,
      enabled: resolved.enabled,
      ...(resolved.presetPreferences ? { presetPreferences: resolved.presetPreferences } : {}),
    };
  });
  return { ...entry, documents, enabled: documents.some((document) => document.enabled) };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
