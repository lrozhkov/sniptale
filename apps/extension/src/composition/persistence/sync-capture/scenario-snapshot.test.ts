import { readCheckpointInTransaction } from './checkpoints';
import { deferCheckpointInTransaction } from './checkpoints';
import { expect, it } from 'vitest';
import {
  getStore,
  createAsset,
  stores,
  db as scenarioDatabase,
} from '../scenario/aggregate-mutations.test-support';
import { commitProjectAggregatePresentation } from '../aggregate-presentations';
import { initDB } from '../infrastructure/indexed-db/core';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  createGuideProject,
  createGuideStep,
  createGuideParagraphs,
  createGuideImageBlock,
} from '../../../features/scenario/project/factories';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import { createVideoProjectAsset } from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { VideoProjectAssetType } from '../../../features/video/project/types';
import { saveVideoProject } from '../projects/index';
import { freezeVideoProjectInTransaction } from './freeze';
import { encodeCapturedProjectRoot } from '../../../workflows/sync-transfer/captured-project';
import { parsePortableSyncRoot } from '../../../workflows/sync-transfer/prepared-root';
import { createMediaLibraryEntry } from '../projects/index.test-support';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { createScenarioProjectEntry } from '../scenario/projects/entry';
import { writeScenarioStorage, readScenarioStorage } from '../scenario/storage';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import {
  SCENARIO_CAPTURE_STORES,
  digestCapturedScenarioRows,
  freezeScenarioInTransaction,
  parseCapturedScenarioRows,
} from './scenario-snapshot';
import { captureScenarioProjectInTransaction, captureRootCheckpointInTransaction } from './capture';
import { parseSyncCaptureRecord } from './guards';
import { commitScenarioAggregateMutation } from '../scenario/aggregate-mutations';
import { deleteScenarioAggregate } from '../scenario/aggregate-cleanup';
import { captureProfileBounds, captureRootKey, pendingCheckpointKey } from './contracts';

function enable() {
  getStore('sync_capture').set('profile', {
    version: 1,
    kind: 'profile',
    key: 'profile',
    createdAt: 1,
    enabled: true,
    spaceId: 'scenario-space',
    connectionGeneration: 1,
  });
}
function captures() {
  return [...getStore('sync_capture').values()].flatMap((raw) => {
    const row = parseSyncCaptureRecord(raw);
    return row?.kind === 'sync-operation' && row.phase === 'native' ? [row] : [];
  });
}

async function checkpointMontage(projectId: string) {
  const db = await initDB();
  const tx = db.transaction([...SCENARIO_CAPTURE_STORES, 'video_projects'], 'readwrite');
  try {
    const pending = await readCheckpointInTransaction(
      tx,
      { spaceId: 'scenario-space', connectionGeneration: 1, profileCreatedAt: 1 },
      { rootKind: 'video-project', rootId: projectId }
    );
    if (!pending) throw new Error('Expected the accepted Montage checkpoint.');
    const result = await captureRootCheckpointInTransaction(tx, pending, { force: true });
    await tx.done;
    return result;
  } catch (error) {
    return abortIndexedDbMutation(tx, error);
  }
}

it.each(['temporary', 'step-template'] as const)(
  'saves a Montage with a %s Scenario prerequisite without promoting or detaching it',
  async (kind) => {
    enable();
    stores.set('video_project_revisions', new Map());
    const project = createGuideProject('Private prerequisite', 'scenario-prerequisite', 1);
    if (kind === 'step-template') project.purpose = 'step-template';
    const { assetRef, ...child } = createAsset(project.id, 'scenario-prerequisite-child');
    const step = createGuideStep('Source', 'source-step');
    step.blocks.push(
      createGuideImageBlock({
        id: 'source-image',
        assetId: child.id,
        width: child.width,
        height: child.height,
        source: { kind: 'import', filename: 'source.png' },
      })
    );
    project.items.push(step);
    const entry = {
      ...createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 }),
      ...(kind === 'temporary'
        ? { lifecycle: { storageClass: 'temporary' as const, savedAt: null, updatedAt: 1 } }
        : {}),
    };
    getStore('scenario_projects').set(entry.id, entry);
    getStore('scenario_assets').set(child.id, child);
    getStore('asset_refs').set(child.assetId, assetRef);
    getStore('asset_owners').set(JSON.stringify(['scenario-asset', child.id, 'body']), {
      ownerKind: 'scenario-asset',
      ownerId: child.id,
      role: 'body',
      assetId: child.assetId,
    });
    const db = await initDB();
    const initial = db.transaction([...SCENARIO_CAPTURE_STORES], 'readwrite');
    expect(await captureScenarioProjectInTransaction(initial, entry.id)).toBeNull();
    await initial.done;
    const montage = createVideoProjectEntryWithMediaClip({ id: 'scenario-montage' }).project;
    const asset = createVideoProjectAsset(
      'Borrowed Scenario image',
      VideoProjectAssetType.IMAGE,
      { kind: 'scenario-asset', scenarioAssetId: child.id },
      {
        audioPeaks: null,
        duration: 0,
        hasAudio: false,
        width: child.width,
        height: child.height,
        mimeType: child.mimeType,
        size: child.size,
      }
    );
    montage.source = { kind: 'scenario', scenarioProjectId: entry.id };
    montage.assets = [asset];
    montage.clips = [
      createVideoClipFromAsset(montage.tracks[0]!.id, asset, montage.width, montage.height),
    ];
    const saved = await saveVideoProject(montage);
    expect(captures()).toEqual([]);
    await checkpointMontage(saved.id);
    expect(saved.project.source).toEqual(montage.source);
    expect(saved.project.assets[0]!.source).toEqual(asset.source);
    const tx = db.transaction([...SCENARIO_CAPTURE_STORES, 'video_projects'], 'readonly');
    const frozen = await freezeVideoProjectInTransaction(tx, saved.id);
    await tx.done;
    expect(frozen.scenarioAssets).toEqual([child]);
    expect(frozen.refs).toEqual([assetRef]);
    const scenarioCapture = captures().find(
      (capture) => capture.change.kind === 'scenario-project'
    );
    const montageCapture = captures().find((capture) => capture.change.kind === 'video-project');
    expect(scenarioCapture?.change.kind).toBe('scenario-project');
    if (
      montageCapture?.change.kind !== 'video-project' ||
      scenarioCapture?.change.kind !== 'scenario-project'
    )
      throw new Error('Expected captured prerequisite and saved Montage.');
    expect(montageCapture.change.rows.rootDependencies).toEqual([
      {
        rootKind: 'scenario-project',
        rootId: project.id,
        generation: scenarioCapture.generation,
        basis: [scenarioCapture.operationId],
        childIds: [child.id],
      },
    ]);
    expect(scenarioCapture.change.rows.entry.lifecycle).toEqual(entry.lifecycle);
    expect(scenarioCapture.change.rows.entry.project.purpose).toEqual(project.purpose);
    expect(getStore('project_assets').size).toBe(0);
    expect(getStore('media_library').size).toBe(0);
    const changed = await commitScenarioAggregateMutation(
      { ...project, name: 'Renamed prerequisite' },
      { expectedRevision: entry.workspaceRevision }
    );
    expect(captures().filter((capture) => capture.change.kind === 'scenario-project')).toHaveLength(
      1
    );
    expect(
      parseSyncCaptureRecord(
        getStore('sync_capture').get(
          pendingCheckpointKey(captureRootKey('scenario-space', 'scenario-project', project.id))
        )
      )
    ).toMatchObject({ kind: 'pending-checkpoint', rootId: project.id });
    expect(changed.project.purpose).toEqual(project.purpose);
  }
);

it.each([false, true])(
  'captures a portable retained Montage after actual Scenario deletion: canonical Library original=%s',
  async (canonical) => {
    enable();
    stores.set('video_project_revisions', new Map());
    const project = createGuideProject('Delete source', 'deleted-source', 1);
    const { assetRef, ...child } = createAsset(project.id, 'retained-source');
    const step = createGuideStep('Source', 'source-step');
    step.blocks.push(
      createGuideImageBlock({
        id: 'image',
        assetId: child.id,
        width: child.width,
        height: child.height,
        source: { kind: 'import', filename: 'source.png' },
      })
    );
    project.items.push(step);
    getStore('scenario_projects').set(
      project.id,
      createScenarioProjectEntry({ project, existing: undefined, updatedAt: 1 })
    );
    getStore('scenario_assets').set(child.id, child);
    getStore('asset_refs').set(child.assetId, assetRef);
    getStore('asset_owners').set(JSON.stringify(['scenario-asset', child.id, 'body']), {
      ownerKind: 'scenario-asset',
      ownerId: child.id,
      role: 'body',
      assetId: child.assetId,
    });
    const mediaId = `scenario-asset:${child.id}`;
    if (canonical) {
      getStore('media_library').set(
        mediaId,
        createMediaLibraryEntry({
          id: mediaId,
          kind: 'image',
          source: { kind: 'stored-asset', assetId: child.assetId },
          mimeType: child.mimeType,
          size: child.size,
        })
      );
      getStore('asset_owners').set(JSON.stringify(['media-library', mediaId, 'source']), {
        ownerKind: 'media-library',
        ownerId: mediaId,
        role: 'source',
        assetId: child.assetId,
      });
    }
    const montage = createVideoProjectEntryWithMediaClip({ id: 'retained-montage' }).project;
    const asset = createVideoProjectAsset(
      'Retained image',
      VideoProjectAssetType.IMAGE,
      { kind: 'scenario-asset', scenarioAssetId: child.id },
      {
        audioPeaks: null,
        duration: 0,
        hasAudio: false,
        width: child.width,
        height: child.height,
        mimeType: child.mimeType,
        size: child.size,
      }
    );
    montage.source = { kind: 'scenario', scenarioProjectId: project.id };
    montage.assets = [asset];
    montage.clips = [
      createVideoClipFromAsset(montage.tracks[0]!.id, asset, montage.width, montage.height),
    ];
    await saveVideoProject(montage);
    await deleteScenarioAggregate(project.id);
    expect(getStore('scenario_projects').has(project.id)).toBe(false);
    expect(getStore('scenario_assets').has(child.id)).toBe(false);
    const detached = parseVideoProjectEntry(getStore('video_projects').get(montage.id));
    expect(detached?.project.source).toEqual({ kind: 'manual' });
    expect(detached?.project.assets[0]!.source.kind).toBe('project-asset');
    await checkpointMontage(montage.id);
    const latest = captures()
      .filter((row) => row.change.kind === 'video-project')
      .at(-1);
    if (latest?.change.kind !== 'video-project')
      throw new Error('Missing accepted detached Montage capture.');
    expect(latest.generation).toBe(1);
    expect(latest.change.rows.project.project).toEqual(detached?.project);
    expect(latest.change.rows.rootDependencies).toBeUndefined();
    expect(latest.change.rows.assets).toHaveLength(1);
    expect(latest.change.rows.assets[0]!.assetId).toBe(child.assetId);
    expect(latest.change.rows.assets[0]!.originMediaId).toBe(canonical ? mediaId : undefined);
    expect(latest.change.rows.mediaDependencies?.map((row) => row.mediaId)).toEqual(
      canonical ? [mediaId] : []
    );
    expect(getStore('media_library').size).toBe(canonical ? 1 : 0);
    expect(getStore('media_library').has(mediaId)).toBe(canonical);
    expect(getStore('asset_refs').get(child.assetId)).toEqual(assetRef);
    const portable = await encodeCapturedProjectRoot(latest.change.rows);
    expect((await parsePortableSyncRoot(portable.envelope)).kind).toBe('video-project');
    expect(portable.dependencies.map((row) => row.mediaId)).toEqual(canonical ? [mediaId] : []);
    expect(portable.objects).toHaveLength(1);
    expect(portable.objects[0]!.blob.size).toBe(child.size);
    expect(portable.bindings).toEqual([
      { objectId: portable.objects[0]!.ref.objectId, ref: assetRef },
    ]);
    expect(portable.rootDependencies).toBeUndefined();
  }
);

it('freezes Scenario history above the pilot metadata budget as a hashed Blob in the writer transaction', async () => {
  const project = createGuideProject('Retained guide', 'guide', 100);
  const text = 'x'.repeat(19_000);
  const historical = Array.from({ length: 20 }, (_, index) => {
    const savedAt = index + 1;
    const previous = createGuideProject(`Version ${index}`, project.id, savedAt);
    previous.items = [
      {
        ...createGuideStep('Step', `step-${index}`),
        blocks: Array.from({ length: 4 }, (_, block) => ({
          kind: 'text' as const,
          id: `block-${block}`,
          paragraphs: createGuideParagraphs(text),
        })),
      },
    ];
    return { revision: index, savedAt, project: previous };
  });
  const entry = {
    ...createScenarioProjectEntry({ project, existing: undefined, updatedAt: 100 }),
    workspaceRevision: 21,
    history: historical,
  };
  expect(parseScenarioProjectEntry(entry)).not.toBeNull();
  const db = await initDB();
  const tx = db.transaction([...SCENARIO_CAPTURE_STORES], 'readwrite');
  await writeScenarioStorage(tx, {
    storage: await readScenarioStorage(tx, project.id),
    existing: undefined,
    entry,
  });
  const frozen = await freezeScenarioInTransaction(tx, project.id);
  await tx.done;
  expect(frozen.entry).not.toHaveProperty('history');
  expect(frozen.history?.blob.size).toBeGreaterThan(1024 * 1024);
  expect(frozen.history?.sha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(parseCapturedScenarioRows(frozen)).not.toBeNull();
  const decoded: unknown = JSON.parse(await frozen.history!.blob.text());
  expect(decoded).toEqual(historical);
});

it('uses the existing archive resource budget for a Guide with more than 32 retained children', async () => {
  const project = createGuideProject('Many resources', 'guide', 1);
  getStore('scenario_projects').set(
    project.id,
    createScenarioProjectEntry({ project, existing: undefined, updatedAt: 2 })
  );
  for (let index = 0; index < 40; index++) {
    const { assetRef, ...asset } = createAsset(project.id, `asset-${index}`);
    getStore('scenario_assets').set(asset.id, asset);
    getStore('asset_refs').set(asset.assetId, assetRef);
  }
  const db = await initDB();
  const tx = db.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
  const rows = await freezeScenarioInTransaction(tx, project.id);
  await tx.done;
  expect(rows.assets).toHaveLength(40);
  expect(rows.refs).toHaveLength(40);
  expect(captureProfileBounds('media').rows).toBe(32);
  expect(captureProfileBounds('scenario-project').rows).toBe(25_000);
  rows.refs.pop();
  expect(parseCapturedScenarioRows(rows)).toBeNull();
});

it('defers opening save and refuses a delayed writer after delete/recreate with a monotone revision', async () => {
  enable();
  const project = createGuideProject('Opening', 'guide', 1);
  const first = await commitScenarioAggregateMutation(project, { expectedRevision: null });
  expect(captures()).toEqual([]);
  const key = pendingCheckpointKey(
    captureRootKey('scenario-space', 'scenario-project', project.id)
  );
  const originalPending = parseSyncCaptureRecord(getStore('sync_capture').get(key));
  expect(originalPending).toMatchObject({ kind: 'pending-checkpoint', rootId: project.id });
  await deleteScenarioAggregate(project.id);
  expect(getStore('sync_capture').has(key)).toBe(false);
  const recreated = await commitScenarioAggregateMutation(
    { ...project, name: 'Recreated' },
    { expectedRevision: null }
  );
  expect(recreated.workspaceRevision).toBeGreaterThan(first.workspaceRevision);
  const recreatedPending = parseSyncCaptureRecord(getStore('sync_capture').get(key));
  if (
    originalPending?.kind !== 'pending-checkpoint' ||
    recreatedPending?.kind !== 'pending-checkpoint'
  )
    throw new Error('Expected separate checkpoint lifetimes.');
  expect(recreatedPending.revision).not.toBe(originalPending.revision);
  const beforeRefusal = structuredClone(stores);
  await expect(
    commitScenarioAggregateMutation(
      { ...first.project, name: 'Delayed old save' },
      { expectedRevision: first.workspaceRevision }
    )
  ).rejects.toThrow();
  expect(stores).toEqual(beforeRefusal);
  expect(captures()).toMatchObject([{ generation: 1, change: { kind: 'tombstone' } }]);
});

it('reuses the accepted Scenario publication identity on command retry', async () => {
  const project = createGuideProject('Published once', 'guide', 1);
  await commitScenarioAggregateMutation(project);
  enable();
  const db = await initDB();
  const tx = db.transaction([...SCENARIO_CAPTURE_STORES], 'readwrite');
  const first = await captureScenarioProjectInTransaction(tx, project.id, {
    publicationId: 'publication',
  });
  const retried = await captureScenarioProjectInTransaction(tx, project.id, {
    publicationId: 'publication',
  });
  await tx.done;
  expect(retried?.operationId).toBe(first?.operationId);
  expect(captures()).toHaveLength(1);
});

it.each([
  { mode: 'checkpoint', stale: false },
  { mode: 'checkpoint', stale: true },
  { mode: 'lifecycle', stale: false },
  { mode: 'lifecycle', stale: true },
] as const)(
  'selects only revision-matched Scenario presentation and preserves the full native predecessor digest: $mode stale=$stale',
  async ({ mode, stale }) => {
    enable();
    const storedProfile = getStore('sync_capture').get('profile');
    if (!storedProfile || typeof storedProfile !== 'object')
      throw new Error('Missing Scenario profile');
    getStore('sync_capture').set('profile', { ...storedProfile, checkpointIntervalMs: 300000 });
    const project = createGuideProject('Latest Scenario content', 'presentation-guide', 1);
    const entry = {
      ...createScenarioProjectEntry({ project, existing: undefined, updatedAt: 2 }),
      workspaceRevision: 2,
    };
    getStore('scenario_projects').set(project.id, entry);
    const key = JSON.stringify(['scenario', project.id]);
    const presentation = {
      aggregateKind: 'scenario',
      aggregateId: project.id,
      presentationRevision: stale ? 1 : 2,
      previewBlob: new Blob(['preview'], { type: 'image/png' }),
      thumbnailBlob: new Blob(['thumbnail'], { type: 'image/png' }),
      updatedAt: 1,
    };
    getStore('aggregate_presentations').set(key, presentation);
    const db = await initDB();
    const tx = db.transaction([...SCENARIO_CAPTURE_STORES, 'sync_outbox'], 'readwrite');
    const pending = await deferCheckpointInTransaction(
      tx,
      { rootKind: 'scenario-project', rootId: project.id },
      10
    );
    if (!pending) throw new Error('Expected pending Scenario');
    const captured =
      mode === 'checkpoint'
        ? await captureRootCheckpointInTransaction(tx, pending, { force: true })
        : await captureScenarioProjectInTransaction(tx, project.id, { checkpoint: 'lifecycle' });
    await tx.done;
    if (captured?.phase !== 'native' || captured.change.kind !== 'scenario-project')
      throw new Error('Expected Scenario checkpoint');
    expect(captured.change.rows.entry.project.name).toBe('Latest Scenario content');
    expect(captured.change.rows.entry.workspaceRevision).toBe(2);
    expect(captured.change.rows.presentation).toEqual(stale ? null : presentation);
    expect(getStore('aggregate_presentations').get(key)).toEqual(presentation);
    const read = db.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
    const native = await freezeScenarioInTransaction(read, project.id);
    await read.done;
    expect(native.presentation).toEqual(presentation);
    expect(await native.presentation!.thumbnailBlob.text()).toBe('thumbnail');
    const rootKey = captureRootKey('scenario-space', 'scenario-project', project.id);
    const state = parseSyncCaptureRecord(
      getStore('sync_capture').get(JSON.stringify(['root-state', rootKey]))
    );
    expect(state).toMatchObject({
      kind: 'root-state',
      nativeRevision: 2,
      nativeDigest: digestCapturedScenarioRows(native),
    });
    if (stale)
      expect(digestCapturedScenarioRows(captured.change.rows)).not.toBe(
        digestCapturedScenarioRows(native)
      );
    expect(getStore('sync_capture').has(pending.key)).toBe(false);
  }
);

it.each([false, true])(
  'commits a late Scenario preview through the real API without changing frozen work ' +
    'or a newer pending receipt: dirty=%s',
  async (dirty) => {
    enable();
    getStore('sync_capture').set('profile', {
      version: 1,
      kind: 'profile',
      key: 'profile',
      createdAt: 1,
      enabled: true,
      spaceId: 'scenario-space',
      connectionGeneration: 1,
      checkpointIntervalMs: 300000,
    });
    const project = createGuideProject('Frozen Scenario', 'late-preview-guide', 1);
    const first = await commitScenarioAggregateMutation(project, { expectedRevision: null });
    const db = await initDB();
    const scope = { spaceId: 'scenario-space', profileCreatedAt: 1, connectionGeneration: 1 };
    const root = { rootKind: 'scenario-project' as const, rootId: project.id };
    const freeze = db.transaction([...SCENARIO_CAPTURE_STORES], 'readwrite');
    const receipt = await readCheckpointInTransaction(freeze, scope, root);
    if (!receipt) throw new Error('Expected saved Scenario checkpoint');
    const captured = await captureRootCheckpointInTransaction(freeze, receipt, { force: true });
    await freeze.done;
    if (captured?.phase !== 'native' || captured.change.kind !== 'scenario-project')
      throw new Error('Expected frozen Scenario payload');
    const immutable = structuredClone(captured);
    const stateKey = JSON.stringify([
      'root-state',
      captureRootKey(scope.spaceId, root.rootKind, root.rootId),
    ]);
    const baseline = parseSyncCaptureRecord(getStore('sync_capture').get(stateKey));
    if (baseline?.kind !== 'root-state') throw new Error('Expected Scenario baseline');
    let revision = first.workspaceRevision;
    if (dirty) {
      const newer = await commitScenarioAggregateMutation(
        { ...first.project, name: 'Newer authored Scenario' },
        { expectedRevision: first.workspaceRevision }
      );
      revision = newer.workspaceRevision;
    }
    const readPending = db.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
    const pending = await readCheckpointInTransaction(readPending, scope, root);
    await readPending.done;
    if (dirty) {
      expect(pending?.revision).toMatch(/^[0-9a-f-]{36}$/u);
      expect(pending?.dueAt).toBe(300100);
    } else expect(pending).toBeNull();
    const before = structuredClone(getStore('sync_capture'));
    const originalTransaction = scenarioDatabase.transaction.getMockImplementation();
    if (!originalTransaction) throw new Error('Expected Scenario database transaction fixture');
    // Keep the native compound presentation key in this test's in-memory transaction.
    scenarioDatabase.transaction.mockImplementationOnce((names) => {
      const tx = originalTransaction(names);
      return {
        ...tx,
        objectStore: (name: string) => {
          const store = tx.objectStore(name);
          return {
            ...store,
            put: async (
              value: Parameters<typeof store.put>[0] & {
                aggregateKind?: string;
                aggregateId?: string;
              }
            ) => {
              if (name === 'aggregate_presentations' && value.aggregateKind && value.aggregateId) {
                getStore(name).set(JSON.stringify([value.aggregateKind, value.aggregateId]), value);
              } else await store.put(value);
            },
          };
        },
      };
    });
    const previewBlob = new Blob(['late Scenario preview'], { type: 'image/png' });
    const presentation = await commitProjectAggregatePresentation({
      expectedWorkspaceRevision: revision,
      ref: { id: project.id, kind: 'scenario' },
      previewBlob,
      thumbnailBlob: new Blob(['late thumbnail'], { type: 'image/png' }),
    });
    const check = db.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
    const native = await freezeScenarioInTransaction(check, project.id);
    expect(await readCheckpointInTransaction(check, scope, root)).toEqual(pending);
    await check.done;
    expect(native.presentation).toEqual(presentation);
    expect(await native.presentation?.previewBlob?.text()).toBe('late Scenario preview');
    expect(
      getStore('aggregate_presentations').get(JSON.stringify(['scenario', project.id]))
    ).toEqual(presentation);
    expect(captures()).toEqual([immutable]);
    expect(captures()[0]).toMatchObject({
      generation: immutable.generation,
      basis: immutable.basis,
    });
    expect(captured.change.rows.presentation).toBeNull();
    const current = parseSyncCaptureRecord(getStore('sync_capture').get(stateKey));
    expect(current).toEqual(
      dirty ? baseline : { ...baseline, nativeDigest: digestCapturedScenarioRows(native) }
    );
    if (dirty) expect(baseline.nativeDigest).not.toBe(digestCapturedScenarioRows(native));
    else
      expect(baseline.nativeDigest).not.toBe(
        current?.kind === 'root-state' ? current.nativeDigest : undefined
      );
    expect(getStore('sync_capture').size).toBe(before.size);
    for (const [key, value] of before) {
      if (key !== stateKey) expect(getStore('sync_capture').get(key)).toEqual(value);
    }
  }
);
