import { expect, it, vi } from 'vitest';
import {
  createBackgroundPresetCatalog,
  parseBackgroundCatalog,
  BACKGROUND_PRESETS_KEY,
} from './catalog';
import { runWithPersistenceDomainMutationLock } from '../infrastructure/mutation-barrier';

function fixture() {
  let value: unknown;
  const set = vi.fn(async (items: Record<string, unknown>) => {
    value = structuredClone(items[BACKGROUND_PRESETS_KEY]);
  });
  const catalog = createBackgroundPresetCatalog({
    storage: {
      local: {
        get: async () => ({ [BACKGROUND_PRESETS_KEY]: value }),
        set,
        remove: async () => undefined,
        isAvailable: () => true,
      },
      canObserveChanges: () => false,
      subscribeToChanges: () => () => undefined,
    },
    mutate: runWithPersistenceDomainMutationLock,
  });
  return {
    catalog,
    set,
    seed: (next: unknown) => {
      value = next;
    },
  };
}

it('ships twenty immutable backgrounds with editable availability and order', async () => {
  const { catalog, set } = fixture();
  const original = await catalog.load();
  expect(original.presets).toHaveLength(20);
  const id = original.presets[0]!.id;
  await expect(catalog.edit({ type: 'rename', id, name: 'changed' })).rejects.toThrow('Immutable');
  await expect(catalog.edit({ type: 'remove', id })).rejects.toThrow('Immutable');
  expect(set).not.toHaveBeenCalled();
  await catalog.edit({ type: 'toggle', id });
  await catalog.edit({ type: 'reorder', ids: original.presets.map((p) => p.id).reverse() });
  expect((await catalog.load()).presets.at(-1)).toEqual({ id, enabled: false });
});

it('retains independent custom identities and rejects malformed writes without losing the prior catalog', async () => {
  const { catalog } = fixture();
  await catalog.edit({ type: 'add', mediaId: 'project-asset:one', name: 'First' });
  const before = await catalog.load();
  const id = before.presets.at(-1)!.id;
  await expect(catalog.edit({ type: 'reorder', ids: [] })).rejects.toThrow();
  expect(await catalog.load()).toEqual(before);
  await catalog.edit({ type: 'rename', id, name: 'Renamed' });
  expect((await catalog.load()).presets.at(-1)).toMatchObject({
    name: 'Renamed',
    mediaId: 'project-asset:one',
  });
  await catalog.edit({ type: 'remove', id });
  expect((await catalog.load()).presets).toHaveLength(20);
});

it('rejects future versions, duplicate identities and supplied bundled definitions', () => {
  expect(() => parseBackgroundCatalog({ version: 2, presets: [] })).toThrow();
  const preset = parseBackgroundCatalog(undefined).presets[0]!;
  expect(() => parseBackgroundCatalog({ version: 1, presets: [preset, preset] })).toThrow();
  expect(() =>
    parseBackgroundCatalog({ version: 1, presets: [{ ...preset, name: 'replacement' }] })
  ).toThrow();
});
