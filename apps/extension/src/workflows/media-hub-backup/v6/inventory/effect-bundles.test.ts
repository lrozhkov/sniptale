import '../../../../composition/persistence/infrastructure/indexed-db/fake-indexed-db.test-support';
import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { beforeEach, afterEach, expect, it } from 'vitest';
import {
  readValidAnimationSourceEntry,
  createValidGlPresetSourceEntry,
} from '../../../../composition/persistence/effect-bundles/fixture.test-support';
import { createArchivePathAllocator } from '../../../../composition/archive-transfer';
import { buildEffectBundleRootInventory } from './effect-bundles';
let db: IDBPDatabase,
  name = '',
  serial = 0;
const stores = [
  'video_animation_packages',
  'video_gl_transition_presets',
  'video_visual_preferences',
  'video_effect_bundles',
];
beforeEach(async () => {
  name = `visual-backup-inventory-${++serial}`;
  db = await openDB(name, 1, {
    upgrade(db) {
      db.createObjectStore(stores[0]!, { keyPath: 'packId' });
      db.createObjectStore(stores[1]!, { keyPath: 'id' });
      db.createObjectStore(stores[2]!, { keyPath: ['kind', 'packId'] });
      db.createObjectStore(stores[3]!, { keyPath: 'packId' });
    },
  });
});
afterEach(async () => {
  db.close();
  await deleteDB(name);
});
it('exports sorted namespaced roots from a native snapshot with original source bytes and separate preferences', async () => {
  const animation = await readValidAnimationSourceEntry(),
    gl = createValidGlPresetSourceEntry('Future', '99.0.0');
  await db.put(stores[0]!, animation);
  await db.put(stores[1]!, gl);
  const preference = {
    format: 'sniptale-visual-preferences',
    version: 1,
    kind: 'animation',
    packId: animation.packId,
    documents: {
      [animation.documents[0]!.id]: {
        sourceSha256: animation.documents[0]!.sha256,
        enabled: false,
      },
    },
  };
  await db.put(stores[2]!, preference);
  const roots = await buildEffectBundleRootInventory(db, createArchivePathAllocator());
  expect(roots.map((root) => root.descriptor.rootId)).toEqual([
    `animation:${animation.packId}`,
    `transition:${gl.id}`,
  ]);
  const payload = await roots[0]!.load();
  expect(payload.metadata).toMatchObject({
    kind: 'animation',
    preferenceSource: JSON.stringify(preference),
  });
  expect(payload.objects).toHaveLength(animation.documents.length);
  expect(await payload.objects[0]!.blob!.text()).toBe(animation.documents[0]!.source);
  expect(await (await roots[1]!.load()).objects[0]!.blob!.text()).toBe(gl.source);
  expect(await db.get(stores[0]!, animation.packId)).toEqual(animation);
});
it('enumerates opaque old identities and refuses full catalogue backup without modifying them', async () => {
  const opaque = { packId: 'legacy-user-pack', privateSource: 'retained opaque bytes' };
  await db.put(stores[3]!, opaque);
  await expect(buildEffectBundleRootInventory(db, createArchivePathAllocator())).rejects.toThrow(
    'legacy-user-pack'
  );
  expect(await db.get(stores[3]!, opaque.packId)).toEqual(opaque);
});
it('refuses forged retained source hashes before returning any root inventory', async () => {
  const entry = await readValidAnimationSourceEntry();
  await db.put(stores[0]!, {
    ...entry,
    documents: entry.documents.map((doc) => ({ ...doc, sha256: '0'.repeat(64) })),
  });
  await expect(buildEffectBundleRootInventory(db, createArchivePathAllocator())).rejects.toThrow();
});

it(
  'roundtrips both source namespaces and separate preferences through ' +
    'a real shared-object ZIP and strict inspector',
  async () => {
    const { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } = await import('../export');
    const { createArchiveMemorySink } =
      await import('../../../../composition/archive-transfer/test-support');
    const { openArchiveReader } = await import('../../../../composition/archive-transfer');
    const { inspectMediaHubBackupV6 } = await import('../inspect');
    const { parseManifestV6, parseBoundedJson } = await import('../codec');
    const { parseBackupRootEnvelope } = await import('../shared-object-envelope');
    const { decodeBackupMetadata } = await import('../metadata-transport');
    const { parseEffectBundleMetadata } = await import('../root-codecs/effect-bundle');
    const { MEDIA_HUB_BACKUP_SHARED_LAYOUT } = await import('../layout');
    const gl = createValidGlPresetSourceEntry('Future', '99.0.0'),
      animation = { ...(await readValidAnimationSourceEntry()), packId: gl.id };
    await db.put(stores[0]!, animation);
    await db.put(stores[1]!, gl);
    const preference = {
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: animation.packId,
      documents: { assetId: { sourceSha256: 'a'.repeat(64), enabled: false } },
    };
    await db.put(stores[2]!, preference);
    const roots = await buildEffectBundleRootInventory(db, createArchivePathAllocator()),
      plan = buildMediaHubBackupExportPlanV6({
        layout: MEDIA_HUB_BACKUP_SHARED_LAYOUT,
        privacy: {
          includeSourceMetadata: false,
          includeTelemetry: false,
          includeWebSnapshots: false,
        },
        roots,
      }),
      output = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: output.sink });
    const archive = output.blob();
    expect((await inspectMediaHubBackupV6(archive)).rootKeys).toEqual([
      `media:effect-bundle:animation:${gl.id}`,
      `media:effect-bundle:transition:${gl.id}`,
    ]);
    const reader = await openArchiveReader(archive);
    try {
      const manifest = parseManifestV6(
        parseBoundedJson(await reader.entry('_sniptale/manifest.json')!.text(4 * 1024 * 1024))
      );
      for (const root of roots) {
        const { envelope } = parseBackupRootEnvelope(
          parseBoundedJson(await reader.entry(root.descriptor.metadataPath)!.text(4 * 1024 * 1024)),
          manifest
        );
        const decoded = await decodeBackupMetadata(reader, envelope),
          metadata = parseEffectBundleMetadata(decoded.envelope.metadata);
        const expected =
            metadata.kind === 'animation'
              ? animation.documents.map((doc) => doc.source)
              : [gl.source],
          ids =
            metadata.kind === 'animation'
              ? metadata.entry.documents.map((doc) => doc.objectId)
              : [metadata.entry.sourceObjectId];
        for (let i = 0; i < ids.length; i++) {
          const object = decoded.envelope.objects.find((object) => object.objectId === ids[i])!;
          expect(await reader.entry(object.path)!.text(object.size)).toBe(expected[i]);
        }
        if (metadata.kind === 'animation') expect(metadata.preference).toEqual(preference);
      }
    } finally {
      await reader.close();
    }
  }
);

it.each([false, true])(
  'keeps resource and preference in one native snapshot while an ordered writer replaces both; writer-first=%s',
  async (writerFirst) => {
    const { parseEffectBundleMetadata } = await import('../root-codecs/effect-bundle');
    const old = await readValidAnimationSourceEntry(),
      next = { ...old, label: { en: 'Updated catalogue label' } };
    const preference = (enabled: boolean) => ({
      format: 'sniptale-visual-preferences',
      version: 1,
      kind: 'animation',
      packId: old.packId,
      documents: { [old.documents[0]!.id]: { sourceSha256: old.documents[0]!.sha256, enabled } },
    });
    await db.put(stores[0]!, old);
    await db.put(stores[2]!, preference(false));
    const replace = () => {
      const tx = db.transaction([stores[0]!, stores[2]!], 'readwrite');
      const done = Promise.all([
        tx.objectStore(stores[0]!).put(next),
        tx.objectStore(stores[2]!).put(preference(true)),
        tx.done,
      ]);
      return done;
    };
    let reading: ReturnType<typeof buildEffectBundleRootInventory>,
      writing: ReturnType<typeof replace>;
    if (writerFirst) {
      writing = replace();
      reading = buildEffectBundleRootInventory(db, createArchivePathAllocator());
    } else {
      reading = buildEffectBundleRootInventory(db, createArchivePathAllocator());
      writing = replace();
    }
    const roots = await reading;
    await writing;
    const metadata = parseEffectBundleMetadata((await roots[0]!.load()).metadata);
    expect(metadata.kind).toBe('animation');
    if (metadata.kind !== 'animation') throw Error('Wrong kind');
    expect(metadata.entry.label).toEqual(writerFirst ? next.label : old.label);
    expect(metadata.preference).toEqual(preference(writerFirst));
    expect(await db.get(stores[0]!, old.packId)).toEqual(next);
  }
);
