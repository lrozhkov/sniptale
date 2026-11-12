import { importAnimationArtifactBytes } from '../../../features/video/project/effect-bundle/lottie-profile';
import { createAnimationCatalogEntry } from './catalog-builder';
import { parseAnimationCatalogEntry, parseStoredAnimationCatalogEntry } from './entry';
import { assertAnimationCatalogIntegrity } from './integrity';
import { expect, it } from 'vitest';

import { createRetainedTitleCatalogEntry } from './fixture.test-support';

async function animationArtifact() {
  const imported = await importAnimationArtifactBytes(
    new TextEncoder().encode(
      JSON.stringify({
        v: '5.12.2',
        fr: 30,
        ip: 0,
        op: 60,
        w: 320,
        h: 180,
        nm: 'Imported caption',
        ddd: 0,
        assets: [],
        layers: [],
      })
    )
  );
  if (!imported.ok) throw new Error('Invalid animation fixture');
  return imported;
}

it('builds a detached animation catalog with exact retained bytes and verified document hashes', async () => {
  const imported = await animationArtifact();
  const entry = await createAnimationCatalogEntry(imported, 123);
  expect(entry).toMatchObject({
    format: 'sniptale-animation-catalog',
    version: 2,
    source: 'lottie-json',
    createdAt: 123,
    updatedAt: 123,
  });
  expect('enabled' in entry).toBe(false);
  expect(
    entry.documents.every(
      (document) => !('enabled' in document) && !('presetPreferences' in document)
    )
  ).toBe(true);
  expect(entry.retainedByteLength).toBe(
    entry.documents.reduce(
      (sum, document) => sum + new TextEncoder().encode(document.source).byteLength,
      0
    )
  );
  expect(parseAnimationCatalogEntry(JSON.parse(JSON.stringify(entry)))).toEqual(entry);
  await expect(assertAnimationCatalogIntegrity(entry)).resolves.toBeUndefined();
  imported.documents[0]!.template.label.en = 'Changed outside the catalog';
  expect(entry.label.en).toBe('Imported caption');
});

it(
  'refuses legacy rows, unknown formats, duplicate identities and ' +
    'incorrect retained measurements in the animation namespace',
  async () => {
    const entry = await createAnimationCatalogEntry(await animationArtifact(), 123);
    const legacy = await createRetainedTitleCatalogEntry();
    expect(parseAnimationCatalogEntry(legacy)).toBeNull();
    for (const invalid of [
      { ...entry, version: 99 },
      { ...entry, source: 'builtin' },
      { ...entry, retainedByteLength: entry.retainedByteLength + 1 },
      {
        ...entry,
        documents: [...entry.documents, ...entry.documents],
        retainedByteLength: entry.retainedByteLength * 2,
      },
      {
        ...entry,
        documents: entry.documents.map((document) => ({ ...document, id: 'different' })),
      },
    ])
      expect(parseAnimationCatalogEntry(invalid)).toBeNull();
  }
);

it('verifies hashes before a prepared animation package can reach storage', async () => {
  const imported = await animationArtifact();
  imported.documents[0]!.sha256 = '0'.repeat(64);
  await expect(createAnimationCatalogEntry(imported, 123)).rejects.toMatchObject({
    code: 'catalogIntegrityFailure',
  });
  const entry = await createAnimationCatalogEntry(await animationArtifact(), 123);
  await expect(
    assertAnimationCatalogIntegrity({
      ...entry,
      documents: entry.documents.map((document) => ({ ...document, sha256: '0'.repeat(64) })),
    })
  ).rejects.toMatchObject({ code: 'catalogIntegrityFailure' });
});

it('reads DB54 prototype resources while stripping preference authority and measuring source bytes', async () => {
  const current = await createAnimationCatalogEntry(await animationArtifact(), 123);
  const preferences = { presets: [{ id: 'saved', name: 'Saved', values: {} }] };
  const prototype = {
    ...current,
    version: 1,
    enabled: false,
    documents: current.documents.map((document) => ({
      ...document,
      enabled: false,
      presetPreferences: preferences,
    })),
    retainedByteLength:
      current.retainedByteLength + new TextEncoder().encode(JSON.stringify(preferences)).byteLength,
  };
  expect(parseAnimationCatalogEntry(prototype)).toBeNull();
  expect(parseStoredAnimationCatalogEntry(prototype)).toEqual(current);
  const { presetPreferences: _preferences, ...document } = prototype.documents[0]!;
  expect(
    parseStoredAnimationCatalogEntry({
      ...prototype,
      documents: [document],
      retainedByteLength: current.retainedByteLength,
    })
  ).toEqual(current);
  for (const invalid of [
    { ...prototype, retainedByteLength: prototype.retainedByteLength + 1 },
    { ...prototype, documents: [{ ...prototype.documents[0], presetPreferences: null }] },
    { ...prototype, documents: [{ ...prototype.documents[0], id: 'wrong' }] },
    { ...prototype, documents: [{ ...prototype.documents[0], source: '{}' }] },
    { ...prototype, documents: [...prototype.documents, ...prototype.documents] },
  ])
    expect(parseStoredAnimationCatalogEntry(invalid)).toBeNull();
});
