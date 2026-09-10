import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { importRawEffectDocument } from '../../../features/video/project/effect-bundle/import/zip';
import { createEffectCatalogEntry } from './catalog-builder';
import { saveEffectPresetPreferences } from './presets';
import { encodeEffectSettingsEntry, decodeEffectSettingsEntry } from './settings-transfer';
const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), abort: vi.fn(), verified: vi.fn() }));
vi.mock('./index', async (original) => ({
  ...(await original<typeof import('./index')>()),
  getEffectBundle: mocks.verified,
}));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: async (run: (db: unknown) => unknown) =>
    run({
      transaction: () => ({
        objectStore: () => mocks,
        abort: mocks.abort,
        done: Promise.resolve(),
      }),
    }),
}));
const source = readFileSync(
  'packages/runtime-contracts/src/effect-v1/fixtures/collection/sniptale-callout.sniptale-effect.json'
);
async function fixture() {
  const parsed = await importRawEffectDocument(new Uint8Array(source));
  if (!parsed.ok) throw new Error('Invalid fixture');
  return createEffectCatalogEntry({ kind: 'raw-json', document: parsed.artifact }, 1);
}
const preferences = {
  presets: [
    {
      id: 'my-style',
      name: 'Мой стиль',
      values: JSON.parse(source.toString()).controlPresets[0].values,
    },
  ],
  defaultPreset: { kind: 'user' as const, id: 'my-style' },
};
beforeEach(() => {
  vi.clearAllMocks();
});
it('persists visual presets and default selection and roundtrips them through settings JSON', async () => {
  const catalog = await fixture();
  mocks.verified.mockResolvedValue(catalog);
  mocks.get.mockResolvedValue(catalog);
  const doc = catalog.documents[0]!;
  const saved = await saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, preferences);
  expect(saved.documents[0]!.presetPreferences).toEqual(preferences);
  expect(mocks.put).toHaveBeenCalledWith(saved);
  const portable = await encodeEffectSettingsEntry(saved);
  expect(decodeEffectSettingsEntry(JSON.parse(JSON.stringify(portable))).documents).toEqual(
    saved.documents
  );
  expect(() =>
    decodeEffectSettingsEntry({
      ...portable,
      documents: [
        {
          ...portable.documents[0],
          presetPreferences: {
            presets: [{ id: 'bad', name: 'Bad', values: { title: 'Overwrite text' } }],
          },
        },
      ],
    })
  ).toThrow();
});
it('rejects stale settings writes and changed source without overwriting either', async () => {
  const catalog = await fixture();
  mocks.verified.mockResolvedValue(catalog);
  mocks.get.mockResolvedValue({
    ...catalog,
    documents: [{ ...catalog.documents[0], presetPreferences: preferences }],
  });
  const doc = catalog.documents[0]!;
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, doc.sha256, { presets: [] })
  ).rejects.toThrow('presets changed');
  expect(mocks.put).not.toHaveBeenCalled();
  expect(mocks.abort).toHaveBeenCalled();
  await expect(
    saveEffectPresetPreferences(catalog.packId, doc.id, 'f'.repeat(64), preferences)
  ).rejects.toThrow('catalog changed');
});
