import { beforeEach, expect, it, vi } from 'vitest';
import {
  readEffectCatalogPreferences,
  mutateEffectCatalogPreference,
  parseEffectCatalogPreferences,
  EFFECT_PREFERENCES_KEY,
} from './preferences';
const memory = vi.hoisted(() => ({ value: undefined as unknown, fail: false }));
vi.mock('../infrastructure/browser-storage', () => ({
  browserStorage: {
    local: {
      get: async () => ({ videoEffectPreferences: memory.value }),
      set: async (values: Record<string, unknown>) => {
        if (memory.fail) throw new Error('quota');
        memory.value = values['videoEffectPreferences'];
      },
    },
  },
}));
vi.mock('../infrastructure/mutation-barrier', async (original) => ({
  ...(await original<typeof import('../infrastructure/mutation-barrier')>()),
  runWithPersistenceMutationPermit: async (run: () => unknown) => run(),
}));
beforeEach(() => {
  memory.value = undefined;
  memory.fail = false;
  let queue = Promise.resolve();
  vi.stubGlobal('navigator', {
    locks: {
      request: (_key: string, run: () => Promise<void>) => {
        const work = queue.then(run);
        queue = work.catch(() => {});
        return work;
      },
    },
  });
});
it('serializes concurrent preference edits and retains missing effects/styles', async () => {
  await Promise.all([
    mutateEffectCatalogPreference('builtin:base', (row) => ({ ...row, enabled: false })),
    mutateEffectCatalogPreference('builtin:base', (row) => ({
      ...row,
      documents: {
        missing: {
          presets: [{ id: 'mine', name: 'Mine', values: { old: 3 } }],
          defaultPreset: { kind: 'builtin', id: 'removed' },
        },
      },
    })),
  ]);
  const saved = await readEffectCatalogPreferences();
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    enabled: false,
    documents: { missing: { defaultPreset: { id: 'removed' } } },
  });
  expect(parseEffectCatalogPreferences(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  await mutateEffectCatalogPreference('base', (row) => ({ ...row, enabled: true }));
  expect(await readEffectCatalogPreferences()).toHaveLength(2);
});
it('propagates quota failure without replacing the authoritative preference value', async () => {
  await mutateEffectCatalogPreference('builtin:base', (row) => ({ ...row, enabled: false }));
  const before = memory.value;
  memory.fail = true;
  await expect(
    mutateEffectCatalogPreference('builtin:base', (row) => ({ ...row, enabled: true }))
  ).rejects.toThrow('quota');
  expect(memory.value).toEqual(before);
  expect(EFFECT_PREFERENCES_KEY).toBe('videoEffectPreferences');
});
it.each([
  null,
  {},
  [{ packId: '../evil', documents: {} }],
  [
    {
      packId: 'p',
      documents: { x: { presets: [{ id: 'a', name: 'n', values: { v: Infinity } }] } },
    },
  ],
  [
    { packId: 'p', documents: {} },
    { packId: 'p', documents: {} },
  ],
])('rejects malformed stored data', (value) => {
  expect(() => parseEffectCatalogPreferences(value)).toThrow();
});

it('exports retained presets while preserving current preferences', async () => {
  const { collectEffectCatalogPreferences } = await import('./preferences');
  const { createEffectCatalogEntry } = await import('./catalog-builder');
  const { readValidBundleArtifact } = await import('./fixture.test-support');
  const entry = await createEffectCatalogEntry(await readValidBundleArtifact(), 1);
  entry.enabled = false;
  entry.documents[0]!.presetPreferences = {
    presets: [{ id: 'saved', name: 'Saved', values: { missing: 2 } }],
  };
  const builtin = {
    packId: 'builtin:base',
    documents: { gone: { presets: [], defaultPreset: { kind: 'builtin' as const, id: 'old' } } },
  };
  const merged = collectEffectCatalogPreferences([entry], [builtin]);
  expect(merged).toContainEqual(builtin);
  expect(merged.find((row) => row.packId === entry.packId)).toMatchObject({
    enabled: false,
    documents: { [entry.documents[0]!.id]: entry.documents[0]!.presetPreferences },
  });
  const cleared = {
    packId: entry.packId,
    enabled: true,
    documents: { [entry.documents[0]!.id]: { presets: [] } },
  };
  expect(collectEffectCatalogPreferences([entry], [cleared])).toEqual([cleared]);
  expect(JSON.stringify(merged)).not.toContain('sourceSha256');
});
