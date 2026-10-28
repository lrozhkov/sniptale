import { expect, it } from 'vitest';
import { getStore, createAsset, stores } from '../scenario/aggregate-mutations.test-support';
import { initDB } from '../infrastructure/indexed-db/core';
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
  freezeScenarioInTransaction,
  parseCapturedScenarioRows,
} from './scenario-snapshot';
import { captureScenarioProjectInTransaction } from './capture';
import { parseSyncCaptureRecord } from './guards';
import { commitScenarioAggregateMutation } from '../scenario/aggregate-mutations';
import { deleteScenarioAggregate } from '../scenario/aggregate-cleanup';
import { captureProfileBounds } from './contracts';

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
      2
    );
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
    const latest = captures()
      .filter((row) => row.change.kind === 'video-project')
      .at(-1);
    if (latest?.change.kind !== 'video-project')
      throw new Error('Missing accepted detached Montage capture.');
    expect(latest.generation).toBe(2);
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

it('captures opening save and rejects a delayed writer after delete/recreate with a monotone revision', async () => {
  enable();
  const project = createGuideProject('Opening', 'guide', 1);
  const first = await commitScenarioAggregateMutation(project, { expectedRevision: null });
  expect(captures()).toHaveLength(1);
  await deleteScenarioAggregate(project.id);
  const recreated = await commitScenarioAggregateMutation(
    { ...project, name: 'Recreated' },
    { expectedRevision: null }
  );
  expect(recreated.workspaceRevision).toBeGreaterThan(first.workspaceRevision);
  await expect(
    commitScenarioAggregateMutation(
      { ...first.project, name: 'Delayed old save' },
      { expectedRevision: first.workspaceRevision }
    )
  ).rejects.toThrow();
  expect(captures().map((row) => row.generation)).toEqual([1, 2, 3]);
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
