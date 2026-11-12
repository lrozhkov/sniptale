import type { ArchiveRestoreStrategy } from '../assets';
import type { AnimationCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { VisualCatalogPreference } from '../../../features/video/project/effect-bundle/catalog/presets';
import { parseAnimationCatalogEntry, parseStoredAnimationCatalogEntry } from './entry';
import { assertAnimationCatalogIntegrity } from './integrity';
import {
  parseGlPresetCatalogEntry,
  GL_PRESET_CATALOG_MAX_BYTES,
  GL_PRESET_CATALOG_MAX_ENTRIES,
  type GlPresetCatalogEntry,
} from './gl-presets';
import { admitVisualCatalogPreferences } from './preferences';
import { EffectBundlePersistenceError } from './errors';

type Source = AnimationCatalogEntry | GlPresetCatalogEntry;
interface SourceStore {
  get(id: string): Promise<unknown>;
  getAll(): Promise<unknown[]>;
  put(entry: Source): Promise<unknown>;
}
interface PreferenceStore {
  getAll(): Promise<unknown[]>;
  put(entry: VisualCatalogPreference): Promise<unknown>;
  delete(key: [VisualCatalogPreference['kind'], string]): Promise<unknown>;
}
function duplicateId(id: string, createId: () => string) {
  const suffix = createId()
    .replace(/[^A-Za-z0-9._-]/g, '')
    .slice(0, 24);
  if (!suffix) throw Error('Invalid animation duplicate identity.');
  return `${id.slice(0, 191 - suffix.length)}-${suffix}`;
}
/** Verify exact source bytes before opening the caller's native publication transaction. */
export async function prepareEffectBundleBackupRestore(args: {
  kind: 'animation' | 'transition';
  entry: unknown;
  preference?: unknown;
}) {
  const source =
    args.kind === 'animation'
      ? parseAnimationCatalogEntry(args.entry)
      : parseGlPresetCatalogEntry(args.entry);
  if (!source) throw Error('Restored visual catalogue source is invalid.');
  if (source.format === 'sniptale-animation-catalog') await assertAnimationCatalogIntegrity(source);
  const candidate = structuredClone(source),
    id = source.format === 'sniptale-animation-catalog' ? source.packId : source.id;
  const preference =
    args.preference === undefined ? undefined : admitVisualCatalogPreferences([args.preference])[0];
  if (preference && (preference.kind !== args.kind || preference.packId !== id))
    throw Error('Restored visual preference identity is invalid.');
  return async function publish(args2: {
    store: SourceStore;
    preferences: PreferenceStore;
    strategy: ArchiveRestoreStrategy;
    createId?: () => string;
    estimate?: StorageEstimate;
  }) {
    const raw = await args2.store.get(id),
      existing =
        raw === undefined
          ? null
          : args.kind === 'animation'
            ? parseStoredAnimationCatalogEntry(raw)
            : parseGlPresetCatalogEntry(raw);
    if (raw !== undefined && !existing) throw Error('Existing visual source is invalid.');
    if (
      existing &&
      (args2.strategy === 'skip' || (args.kind === 'transition' && args2.strategy === 'duplicate'))
    )
      return { conflicted: true, imported: false, packId: id, rootId: `${args.kind}:${id}` };
    let targetId = id;
    if (existing && args2.strategy === 'duplicate') {
      const createId = args2.createId ?? (() => crypto.randomUUID());
      let found = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        targetId = duplicateId(id, createId);
        if ((await args2.store.get(targetId)) === undefined) {
          found = true;
          break;
        }
      }
      if (!found) throw Error('Could not allocate a unique animation catalogue identity.');
    }
    const target: Source =
      candidate.format === 'sniptale-animation-catalog'
        ? { ...candidate, packId: targetId }
        : candidate;
    const values = await args2.store.getAll();
    let retained = 0,
      previousBytes = 0;
    for (const value of values) {
      const row =
        args.kind === 'animation'
          ? parseStoredAnimationCatalogEntry(value)
          : parseGlPresetCatalogEntry(value);
      if (!row) throw Error('Existing visual catalogue is invalid.');
      retained += row.retainedByteLength;
      const rowId = row.format === 'sniptale-animation-catalog' ? row.packId : row.id;
      if (rowId === targetId) previousBytes = row.retainedByteLength;
    }
    const next = retained - previousBytes + target.retainedByteLength,
      estimate = args2.estimate;
    if (
      next > (args.kind === 'animation' ? 512 * 1024 * 1024 : GL_PRESET_CATALOG_MAX_BYTES) ||
      (args.kind === 'transition' &&
        values.length + (previousBytes ? 0 : 1) > GL_PRESET_CATALOG_MAX_ENTRIES) ||
      (estimate?.usage !== undefined &&
        estimate.quota !== undefined &&
        estimate.usage + Math.max(0, next - retained) + 64 * 1024 * 1024 > estimate.quota)
    )
      throw new EffectBundlePersistenceError('catalogQuotaExceeded');
    const nextPreference = preference
      ? { ...structuredClone(preference), packId: targetId }
      : undefined;
    const currentPreferences = await args2.preferences.getAll();
    const remaining = admitVisualCatalogPreferences(currentPreferences).filter(
      (row) => !(row.kind === args.kind && row.packId === targetId)
    );
    admitVisualCatalogPreferences([...remaining, ...(nextPreference ? [nextPreference] : [])]);
    if (nextPreference) await args2.preferences.put(nextPreference);
    else await args2.preferences.delete([args.kind, targetId]);
    await args2.store.put(target);
    return {
      conflicted: existing !== null,
      imported: true,
      packId: targetId,
      rootId: `${args.kind}:${targetId}`,
    };
  };
}
