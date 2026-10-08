import { evaluateDatabaseMigrationPlan } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/admission';
import { buildDatabaseMigrationPlan } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/schema-contracts';
import { openDB } from 'idb';
import { handleDatabaseUpgrade } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/upgrade/core';
import {
  DB_NAME,
  DB_VERSION,
} from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/core.stores';
import { betaV8Fixture } from '../../../../apps/extension/src/composition/persistence/infrastructure/indexed-db/fixtures/beta-v8';
import {
  createVideoProjectEntryWithMediaClip,
  createMediaLibraryEntry,
} from '../../../../apps/extension/src/composition/persistence/projects/index.test-support';
import { readIndexedProjectUsage } from '../../../../apps/extension/src/composition/persistence/media-library/usage-index';
import { maintainProjectUsageIndex } from '../../../../apps/extension/src/composition/persistence/media-library/usage-index-maintenance';
import {
  withVideoProjectUsage,
  usageReferenceKey,
} from '../../../../apps/extension/src/composition/persistence/media-library/usage-index-keys';

/** Browser-native versionchange, index transactions and legacy backfill, without an IDB mock. */
export async function probe() {
  const legacy = await openDB(DB_NAME, 8, {
    upgrade(db, old, next, tx) {
      handleDatabaseUpgrade(db, old, next, tx);
      for (const [store, indexes] of [
        ['video_projects', ['usageReferenceKeys']],
        ['video_workspaces', ['usageReferenceKeys']],
        ['project_assets', ['originMediaId']],
        ['scenario_assets', ['borrowedMediaId', 'galleryAssetId']],
      ] as const)
        for (const index of indexes) tx.objectStore(store).deleteIndex(index);
      for (const [domainId, schemaVersion] of Object.entries(betaV8Fixture.domainVersions))
        tx.objectStore('schema_contracts').put({ domainId, schemaVersion });
    },
  });
  const media = createMediaLibraryEntry({ id: 'target', source: { kind: 'screenshot' } });
  const video = createVideoProjectEntryWithMediaClip();
  video.project.assets[0]!.source = { kind: 'library-asset', mediaId: media.id };
  const seed = legacy.transaction(['video_projects', 'media_library'], 'readwrite');
  await seed.objectStore('media_library').put(media);
  for (let i = 0; i < 1001; i++) {
    const row = structuredClone(video);
    row.id = row.project.id = `project-${i}`;
    row.project.assets[0]!.source = {
      kind: 'library-asset',
      mediaId: i === 1000 ? media.id : `unrelated-${i}`,
    };
    await seed.objectStore('video_projects').put(row);
  }
  await seed.done;
  const admission = await evaluateDatabaseMigrationPlan(
    8,
    buildDatabaseMigrationPlan(8, DB_VERSION)!,
    legacy
  );
  legacy.close();
  let aborted = false;
  try {
    await openDB(DB_NAME, DB_VERSION, {
      upgrade(db, old, next, tx) {
        handleDatabaseUpgrade(db, old, next, tx);
        tx.abort();
      },
    });
  } catch {
    aborted = true;
  }
  const prior = await openDB(DB_NAME);
  const rollback =
    prior.version === 8 &&
    !prior.transaction('video_projects').store.indexNames.contains('usageReferenceKeys');
  prior.close();
  const db = await openDB(DB_NAME, DB_VERSION, { upgrade: handleDatabaseUpgrade });
  let pending = false;
  try {
    await readIndexedProjectUsage(media.id);
  } catch {
    pending = true;
  }
  const changed = await maintainProjectUsageIndex(new AbortController().signal);
  const usage = await readIndexedProjectUsage(media.id);
  const target = await db.get('video_projects', 'project-1000');
  const tx = db.transaction('video_projects', 'readwrite');
  await tx.store.delete('project-1000');
  tx.abort();
  await tx.done.catch(() => undefined);
  const rollbackCount = await db.countFromIndex(
    'video_projects',
    'usageReferenceKeys',
    usageReferenceKey('library-asset', media.id)
  );
  target.project.assets = [];
  await db.put('video_projects', withVideoProjectUsage(target));
  const afterEdit = await readIndexedProjectUsage(media.id);
  await db.delete('video_projects', 'project-1000');
  const indexedCount = await db.countFromIndex(
    'video_projects',
    'usageReferenceKeys',
    'indexed:v1'
  );
  db.close();
  return {
    admission,
    aborted,
    rollback,
    pending,
    changed,
    usage,
    rollbackCount,
    afterEdit,
    indexedCount,
  };
}
