import { parseEffectV1Source } from '@sniptale/runtime-contracts/effect-v1';
import { parseEffectCatalogPreferences } from './preferences';
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { importRawEffectDocument } from '../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from './catalog-builder';
import { saveEffectPresetPreferences } from './presets';
import { encodeEffectSettingsEntry } from './settings-transfer';
import type { EffectBundleCatalogEntry } from '../../../features/video/project/effect-bundle/catalog';
import type { EffectCatalogPreference } from './preferences';
const state = vi.hoisted(() => ({
  catalog: null as EffectBundleCatalogEntry | null,
  preference: { packId: 'p', documents: {} } as EffectCatalogPreference,
}));
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  getEffectBundle: async () =>
    state.catalog && {
      ...state.catalog,
      documents: state.catalog.documents.map((doc) => ({
        ...doc,
        presetPreferences: state.preference.documents[doc.id],
      })),
    },
}));
vi.mock('./preferences', async (original) => ({
  ...(await original<typeof import('./preferences')>()),
  mutateEffectCatalogPreference: async (
    _id: string,
    update: (row: EffectCatalogPreference) => EffectCatalogPreference
  ) => {
    state.preference = update(state.preference);
  },
}));
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json'
);
beforeEach(async () => {
  const parsed = await importRawEffectDocument(new Uint8Array(source));
  if (!parsed.ok) throw new Error('fixture');
  state.catalog = await createEffectCatalogEntry(
    { kind: 'raw-json', document: parsed.artifact },
    1
  );
  state.preference = { packId: state.catalog.packId, documents: {} };
});
it('stores preferences separately and transfers them without embedding definitions', async () => {
  const doc = state.catalog!.documents[0]!;
  const preferences = {
    presets: [
      {
        id: 'mine',
        name: 'Мой',
        values: parseEffectV1Source(source.toString()).document!.controlPresets![0]!.values,
      },
    ],
  };
  const saved = await saveEffectPresetPreferences(
    state.catalog!.packId,
    doc.id,
    doc.sha256,
    preferences
  );
  expect(saved.documents[0]!.presetPreferences).toEqual(preferences);
  const portable = [state.preference];
  expect(parseEffectCatalogPreferences(JSON.parse(JSON.stringify(portable)))).toEqual(portable);
  expect(JSON.stringify(portable)).not.toContain('graph');
  const imported = await encodeEffectSettingsEntry(saved);
  expect(imported.documents[0]!.presetPreferences).toBeUndefined();
});
it('rejects stale writes and new protected values, but retains an unavailable old preset', async () => {
  const doc = state.catalog!.documents[0]!;
  const unavailable = { presets: [{ id: 'old', name: 'Old', values: { removed: 3 } }] };
  state.preference.documents[doc.id] = unavailable;
  await expect(
    saveEffectPresetPreferences(state.catalog!.packId, doc.id, doc.sha256, { presets: [] })
  ).rejects.toThrow('presets changed');
  await saveEffectPresetPreferences(
    state.catalog!.packId,
    doc.id,
    doc.sha256,
    unavailable,
    unavailable
  );
  await expect(
    saveEffectPresetPreferences(
      state.catalog!.packId,
      doc.id,
      doc.sha256,
      { presets: [{ id: 'text', name: 'Text', values: { title: 'bad' } }] },
      unavailable
    )
  ).rejects.toThrow('Invalid effect presets');
  await expect(
    saveEffectPresetPreferences(
      state.catalog!.packId,
      doc.id,
      'f'.repeat(64),
      unavailable,
      unavailable
    )
  ).rejects.toThrow('catalog changed');
  expect(state.preference.documents[doc.id]).toEqual(unavailable);
});

it('rejects missing catalogs and unavailable new defaults without discarding saved presets', async () => {
  const catalog = state.catalog!;
  state.catalog = null;
  await expect(saveEffectPresetPreferences('p', 'missing', 'sha', { presets: [] })).rejects.toThrow(
    'Effect catalog changed'
  );
  state.catalog = catalog;
  const doc = catalog.documents[0]!;
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, {
      presets: [],
      defaultPreset: { kind: 'user', id: 'missing' },
    })
  ).rejects.toThrow('Unavailable effect preset');
  const id = parseEffectV1Source(doc.source!).document!.controlPresets![0]!.id;
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, {
      presets: [],
      defaultPreset: { kind: 'builtin', id },
    })
  ).resolves.toBeTruthy();
});
