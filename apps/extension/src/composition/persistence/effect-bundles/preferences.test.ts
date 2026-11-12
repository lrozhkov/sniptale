import { expect, it } from 'vitest';
import { admitVisualCatalogPreferences, overlayVisualAnimationPreferences } from './preferences';
import { readValidAnimationCatalog } from './fixture.test-support';

it('keeps animation and transition identities independent, including unavailable preset references', () => {
  const rows = ['animation', 'transition'].map((kind) => ({
    format: 'sniptale-visual-preferences',
    version: 1,
    kind,
    packId: 'same',
    documents: {
      missing: {
        sourceSha256: 'a'.repeat(64),
        enabled: false,
        presetPreferences: {
          presets: [{ id: 'mine', name: 'Mine', values: { old: 3 } }],
          defaultPreset: { kind: 'builtin', id: 'removed' },
        },
      },
    },
  }));
  expect(admitVisualCatalogPreferences(JSON.parse(JSON.stringify(rows)))).toEqual(rows);
});
it.each([
  null,
  {},
  [{ kind: 'animation', packId: '../bad', documents: {} }],
  [
    { kind: 'animation', packId: 'p', documents: {} },
    { kind: 'animation', packId: 'p', documents: {} },
  ],
  [{ kind: 'animation', packId: 'p', documents: { x: { sourceSha256: 'bad', enabled: false } } }],
])('rejects malformed preferences without a browser-storage fallback: %j', (value) => {
  expect(() => admitVisualCatalogPreferences(value)).toThrow();
});
it('uses exact package, document and digest identities for disposable availability and presets', async () => {
  const entry = await readValidAnimationCatalog();
  const d = entry.documents[0]!;
  const preferences = admitVisualCatalogPreferences([
    {
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: entry.packId,
      documents: {
        [d.id]: { sourceSha256: d.sha256, enabled: false, presetPreferences: { presets: [] } },
      },
    },
  ]);
  expect(overlayVisualAnimationPreferences(entry, preferences).documents[0]).toMatchObject({
    enabled: false,
    presetPreferences: { presets: [] },
  });
  expect(
    overlayVisualAnimationPreferences({ ...entry, packId: 'another' }, preferences).documents[0]!
      .enabled
  ).toBe(true);
  expect(
    overlayVisualAnimationPreferences(
      { ...entry, documents: [{ ...d, sha256: '0'.repeat(64) }] },
      preferences
    ).documents[0]!.enabled
  ).toBe(true);
  expect(entry.documents[0]!.enabled).not.toBe(false);
});
