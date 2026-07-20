import JSZip from 'jszip';
import { expect, it } from 'vitest';

import { createEffectVideoProjectFixture } from '../../export/projects/video-fixture.test-support';
import { assertPreparedProjectBlobsAvailable } from './preflight';
import { remapVideoProjectEntry } from './remap';
import type { PreparedProjectDomains, PreparedVideoProject } from './prepare';

it('restores EffectV1 snapshot bytes before the atomic write candidate is assembled', async () => {
  const { prepared, project, zip } = await createPreparedEffectProject();
  const domains = createDomains(prepared);

  await assertPreparedProjectBlobsAvailable(domains, zip);
  const restored = remapVideoProjectEntry(prepared);

  expect(restored.project.effectInstances).toEqual(project.effectInstances);
  expect(restored.project.effectSnapshots?.[0]?.assets[0]).toEqual(
    expect.objectContaining({
      blob: expect.any(Blob),
      id: 'mark',
      mimeType: 'image/svg+xml',
    })
  );
  expect(await restored.project.effectSnapshots![0]!.assets[0]!.blob.text()).toContain('<svg');
});

it('fails preflight on missing or hash-mismatched EffectV1 snapshot bytes', async () => {
  const missing = await createPreparedEffectProject();
  missing.zip.remove('video-projects/video-effect/effects/0/0');
  await expect(
    assertPreparedProjectBlobsAvailable(createDomains(missing.prepared), missing.zip)
  ).rejects.toThrow('effects/0/0');

  const tampered = await createPreparedEffectProject();
  const tamperedBytes = new Uint8Array(
    await tampered.project.effectSnapshots![0]!.assets[0]!.blob.arrayBuffer()
  );
  tamperedBytes[tamperedBytes.length - 1] = tamperedBytes[tamperedBytes.length - 1]! ^ 1;
  tampered.zip.file('video-projects/video-effect/effects/0/0', tamperedBytes);
  await expect(
    assertPreparedProjectBlobsAvailable(createDomains(tampered.prepared), tampered.zip)
  ).rejects.toEqual(expect.objectContaining({ code: 'effectSnapshotIntegrityFailure' }));
});

async function createPreparedEffectProject(): Promise<{
  prepared: PreparedVideoProject;
  project: Awaited<ReturnType<typeof createEffectVideoProjectFixture>>;
  zip: JSZip;
}> {
  const project = await createEffectVideoProjectFixture('video-effect');
  const snapshots = project.effectSnapshots!;
  const instances = project.effectInstances!;
  const { effectInstances: _instances, effectSnapshots: _snapshots, ...baseProject } = project;
  const prepared: PreparedVideoProject = {
    descriptor: {
      effectProject: {
        instances,
        snapshots: snapshots.map((snapshot, snapshotIndex) => {
          const { assets, ...entry } = snapshot;
          return {
            ...entry,
            assets: assets.map((asset, assetIndex) => {
              const { blob: _blob, ...assetEntry } = asset;
              return {
                blobPath: `video-projects/video-effect/effects/${snapshotIndex}/${assetIndex}`,
                entry: assetEntry,
              };
            }),
          };
        }),
      },
      entry: { createdAt: 1, id: project.id, project: baseProject, updatedAt: 2 },
      projectAssets: [],
      projectExports: [],
    },
    idChanged: false,
    projectAssetIdMap: new Map(),
    projectExportIdMap: new Map(),
    projectId: project.id,
    recordingIdMap: new Map(),
  };
  const zip = new JSZip();
  zip.file(
    'video-projects/video-effect/effects/0/0',
    new Uint8Array(await snapshots[0]!.assets[0]!.blob.arrayBuffer())
  );
  return { prepared, project, zip };
}

function createDomains(prepared: PreparedVideoProject): PreparedProjectDomains {
  return {
    changedIds: [],
    conflictsResolved: 0,
    effectBundles: [],
    scenarioProjects: [],
    skipped: 0,
    videoProjects: [prepared],
  };
}
