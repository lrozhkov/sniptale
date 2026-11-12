import '../infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { prepareEffectBundleBackupRestore } from './backup-restore';
import {
  readValidAnimationSourceEntry,
  createValidGlPresetSourceEntry,
} from './fixture.test-support';
let db: IDBPDatabase,
  name = '',
  serial = 0;
beforeEach(async () => {
  name = `visual-prepared-restore-${++serial}`;
  db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore('animation', { keyPath: 'packId' });
      db.createObjectStore('transition', { keyPath: 'id' });
      db.createObjectStore('preferences', { keyPath: ['kind', 'packId'] });
    },
  });
});
afterEach(async () => {
  db.close();
  await deleteDB(name);
});
async function publish(
  kind: 'animation' | 'transition',
  prepared: Awaited<ReturnType<typeof prepareEffectBundleBackupRestore>>,
  strategy: 'skip' | 'replace' | 'duplicate',
  extra: Partial<Parameters<typeof prepared>[0]> = {}
) {
  const tx = db.transaction([kind, 'preferences'], 'readwrite');
  try {
    const result = await prepared({
      store: tx.objectStore(kind),
      preferences: tx.objectStore('preferences'),
      strategy,
      ...extra,
    });
    await tx.done;
    return result;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      // The transaction can already be aborted.
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
}
it('restores exact verified Lottie source and preferences, remaps a duplicate and retains skip state', async () => {
  const entry = await readValidAnimationSourceEntry(),
    doc = entry.documents[0]!;
  const preference = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: entry.packId,
    documents: { [doc.id]: { sourceSha256: doc.sha256, enabled: false } },
  };
  const prepared = await prepareEffectBundleBackupRestore({ kind: 'animation', entry, preference });
  await expect(publish('animation', prepared, 'replace')).resolves.toMatchObject({
    imported: true,
    conflicted: false,
    packId: entry.packId,
  });
  expect(await db.get('animation', entry.packId)).toEqual(entry);
  expect(await db.get('preferences', ['animation', entry.packId])).toEqual(preference);
  const skipped = await publish('animation', prepared, 'skip');
  expect(skipped.imported).toBe(false);
  expect(await db.count('animation')).toBe(1);
  const duplicate = await publish('animation', prepared, 'duplicate', { createId: () => 'copy' });
  expect(duplicate.packId).not.toBe(entry.packId);
  expect(await db.get('animation', duplicate.packId)).toEqual({
    ...entry,
    packId: duplicate.packId,
  });
  expect(await db.get('preferences', ['animation', duplicate.packId])).toEqual({
    ...preference,
    packId: duplicate.packId,
  });
});
it(
  'retains unsupported closed GL sources and deduplicates immutable ' +
    'duplicate identities without replacing preferences',
  async () => {
    const entry = createValidGlPresetSourceEntry('Future', '99.0.0'),
      prepared = await prepareEffectBundleBackupRestore({ kind: 'transition', entry });
    await publish('transition', prepared, 'replace');
    const preference = {
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'transition',
      packId: entry.id,
      documents: { Fade: { sourceSha256: entry.sourceSha256, enabled: false } },
    };
    await db.put('preferences', preference);
    expect(await publish('transition', prepared, 'duplicate')).toMatchObject({
      imported: false,
      conflicted: true,
      packId: entry.id,
    });
    expect(await db.get('preferences', ['transition', entry.id])).toEqual(preference);
    await publish('transition', prepared, 'replace');
    expect(await db.get('preferences', ['transition', entry.id])).toBeUndefined();
    expect((await db.get('transition', entry.id)).source).toBe(entry.source);
  }
);
it('refuses malformed sources and foreign preference identity before opening publication', async () => {
  const animation = await readValidAnimationSourceEntry(),
    gl = createValidGlPresetSourceEntry();
  await expect(
    prepareEffectBundleBackupRestore({
      kind: 'animation',
      entry: {
        ...animation,
        documents: animation.documents.map((doc) => ({ ...doc, sha256: '0'.repeat(64) })),
      },
    })
  ).rejects.toThrow();
  await expect(
    prepareEffectBundleBackupRestore({
      kind: 'transition',
      entry: { ...gl, source: gl.source + ' ' },
    })
  ).rejects.toThrow();
  await expect(
    prepareEffectBundleBackupRestore({
      kind: 'transition',
      entry: gl,
      preference: {
        format: 'sniptale-visual-preferences',
        version: 1,
        kind: 'animation',
        packId: gl.id,
        documents: {},
      },
    })
  ).rejects.toThrow();
  expect(await db.count('animation')).toBe(0);
  expect(await db.count('transition')).toBe(0);
});
it('does not overwrite another identity on repeated duplicate collisions and preserves completed sources', async () => {
  const entry = await readValidAnimationSourceEntry(),
    prepared = await prepareEffectBundleBackupRestore({ kind: 'animation', entry });
  await publish('animation', prepared, 'replace');
  await publish('animation', prepared, 'duplicate', { createId: () => 'same' });
  await expect(
    publish('animation', prepared, 'duplicate', { createId: () => 'same' })
  ).rejects.toThrow('unique');
  expect(await db.count('animation')).toBe(2);
  expect(await db.get('animation', entry.packId)).toEqual(entry);
});
it('refuses insufficient physical storage and rolls back preference changes with a source-write failure', async () => {
  const entry = createValidGlPresetSourceEntry(),
    prepared = await prepareEffectBundleBackupRestore({ kind: 'transition', entry });
  await expect(
    publish('transition', prepared, 'replace', { estimate: { quota: 1, usage: 0 } })
  ).rejects.toThrow('catalogQuotaExceeded');
  expect(await db.count('transition')).toBe(0);
  const tx = db.transaction(['transition', 'preferences'], 'readwrite');
  await expect(
    prepared({
      store: {
        get: (id) => tx.objectStore('transition').get(id),
        getAll: () => tx.objectStore('transition').getAll(),
        put: async () => {
          throw Error('Source write failed');
        },
      },
      preferences: tx.objectStore('preferences'),
      strategy: 'replace',
    })
  ).rejects.toThrow('Source write failed');
  tx.abort();
  await tx.done.catch(() => undefined);
  expect(await db.count('preferences')).toBe(0);
  await expect(publish('transition', prepared, 'replace')).resolves.toMatchObject({
    imported: true,
  });
});
