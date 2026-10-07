import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import type { browserStorage } from '../infrastructure/browser-storage';
import type { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';
import { BUNDLED_BACKGROUNDS } from './bundled';

export const BACKGROUND_PRESETS_KEY = 'sniptale_background_presets';
export interface BackgroundPreset {
  id: string;
  enabled: boolean;
  name?: string;
  mediaId?: string;
}
interface BackgroundCatalog {
  version: 1;
  presets: BackgroundPreset[];
}
export type BackgroundCatalogEdit =
  | { type: 'toggle'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'add'; mediaId: string; name: string }
  | { type: 'reorder'; ids: readonly string[] };

function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
}
function builtin(id: string) {
  return BUNDLED_BACKGROUNDS.some((item) => item.id === id);
}
/** Admit bounded metadata only. Stored paths or image bytes are never authoritative. */
export function parseBackgroundCatalog(value: unknown): BackgroundCatalog {
  if (value === undefined)
    return {
      version: 1,
      presets: BUNDLED_BACKGROUNDS.map(({ id }) => ({ id, enabled: true })),
    };
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !Array.isArray(value['presets']) ||
    value['presets'].length > 220 ||
    Object.keys(value).some((key) => !['version', 'presets'].includes(key))
  )
    throw new Error('Invalid background catalog');
  const seen = new Set<string>();
  const presets = value['presets'].map((row): BackgroundPreset => {
    if (
      !isRecord(row) ||
      typeof row['id'] !== 'string' ||
      row['id'].length > 256 ||
      typeof row['enabled'] !== 'boolean' ||
      seen.has(row['id'])
    )
      throw new Error('Invalid background preset');
    seen.add(row['id']);
    if (builtin(row['id'])) {
      if (Object.keys(row).some((key) => !['id', 'enabled'].includes(key)))
        throw new Error('Immutable background preset');
      return { id: row['id'], enabled: row['enabled'] };
    }
    if (
      !row['id'].startsWith('user:') ||
      !validName(row['name']) ||
      typeof row['mediaId'] !== 'string' ||
      !row['mediaId'] ||
      row['mediaId'].length > 256 ||
      Object.keys(row).some((key) => !['id', 'enabled', 'name', 'mediaId'].includes(key))
    )
      throw new Error('Invalid custom background');
    return { id: row['id'], enabled: row['enabled'], name: row['name'], mediaId: row['mediaId'] };
  });
  for (const { id } of BUNDLED_BACKGROUNDS) if (!seen.has(id)) presets.push({ id, enabled: true });
  if (presets.length > 220) throw new Error('Background catalog full');
  return { version: 1, presets };
}

/** One metadata writer; Library bytes retain their existing independent lifecycle. */
export function createBackgroundPresetCatalog(deps: {
  storage: Pick<typeof browserStorage, 'local' | 'canObserveChanges' | 'subscribeToChanges'>;
  mutate: typeof runWithPersistenceDomainMutationLock;
}) {
  const load = async () =>
    parseBackgroundCatalog(
      (await deps.storage.local.get(BACKGROUND_PRESETS_KEY))[BACKGROUND_PRESETS_KEY]
    );
  const edit = (edit: BackgroundCatalogEdit) =>
    deps.mutate('background-presets', async (permit) => {
      const catalog = await load();
      if (edit.type === 'reorder') {
        if (
          edit.ids.length !== catalog.presets.length ||
          new Set(edit.ids).size !== edit.ids.length ||
          edit.ids.some((id) => !catalog.presets.some((item) => item.id === id))
        )
          throw new Error('Invalid background order');
        catalog.presets = edit.ids.map((id) => catalog.presets.find((item) => item.id === id)!);
      } else if (edit.type === 'add') {
        if (!validName(edit.name) || catalog.presets.length >= 220)
          throw new Error('Background catalog full');
        catalog.presets.push({
          id: `user:${crypto.randomUUID()}`,
          enabled: true,
          name: edit.name.trim(),
          mediaId: edit.mediaId,
        });
      } else {
        const current = catalog.presets.find((item) => item.id === edit.id);
        if (!current) throw new Error('Missing background preset');
        if (edit.type === 'toggle') current.enabled = !current.enabled;
        else {
          if (builtin(current.id)) throw new Error('Immutable background preset');
          if (edit.type === 'remove')
            catalog.presets = catalog.presets.filter((item) => item.id !== edit.id);
          else {
            if (!validName(edit.name)) throw new Error('Invalid background name');
            current.name = edit.name.trim();
          }
        }
      }
      await deps.storage.local.set(
        { [BACKGROUND_PRESETS_KEY]: parseBackgroundCatalog(catalog) },
        permit
      );
    });
  const subscribe = (listener: () => void) =>
    deps.storage.canObserveChanges()
      ? deps.storage.subscribeToChanges((changes, area) => {
          if (area === 'local' && BACKGROUND_PRESETS_KEY in changes) listener();
        })
      : () => undefined;
  return { load, edit, subscribe };
}
