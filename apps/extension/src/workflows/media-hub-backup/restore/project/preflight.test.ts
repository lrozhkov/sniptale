import JSZip from 'jszip';
import { beforeEach, expect, it, vi } from 'vitest';

const assetMocks = vi.hoisted(() => ({
  admit: vi.fn(),
  createJournal: vi.fn(),
  deleteObject: vi.fn(),
  deleteJournal: vi.fn(),
  discard: vi.fn(),
  streamAsset: vi.fn(),
}));

vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  assertAssetWriteAdmission: assetMocks.admit,
  createAssetPublicationJournal: assetMocks.createJournal,
  deleteAssetObject: assetMocks.deleteObject,
  deleteReadyJournal: assetMocks.deleteJournal,
  discardPreparedAsset: assetMocks.discard,
}));

vi.mock('../asset-stream', () => ({
  writeBackupArchiveEntryToAsset: assetMocks.streamAsset,
}));

import { assertPreparedProjectBlobsAvailable, stagePreparedProjectAssets } from './preflight';
import { createMissingProjectBlobZip, createPreparedDomains } from '../projects/test-support';

beforeEach(() => {
  vi.clearAllMocks();
  assetMocks.admit.mockResolvedValue(undefined);
  assetMocks.streamAsset.mockResolvedValue(createPreparedAsset('asset-default'));
});

it('materializes only bounded owners and leaves durable media for streaming staging', async () => {
  const zip = new JSZip();
  const paths = [
    'export-thumb',
    'project-asset',
    'recording',
    'scenario-asset',
    'scenario-export-thumb',
    'scenario-thumb',
    'video-thumb',
  ];
  for (const path of paths) {
    zip.file(path, path);
  }
  const asyncSpies = paths.map((path) => vi.spyOn(zip.file(path)!, 'async'));
  const fileSpy = vi.spyOn(zip, 'file');

  await expect(
    assertPreparedProjectBlobsAvailable(createPreparedDomains(), zip)
  ).resolves.toBeUndefined();

  expect(fileSpy).toHaveBeenCalledWith('scenario-asset');
  expect(fileSpy).toHaveBeenCalledWith('recording');
  const asyncCallsByPath = Object.fromEntries(
    paths.map((path, index) => [path, asyncSpies[index]!.mock.calls.length])
  );
  expect(asyncCallsByPath).toMatchObject({
    'export-thumb': 1,
    'project-asset': 0,
    recording: 0,
    'scenario-asset': 0,
    'scenario-export-thumb': 1,
    'scenario-thumb': 1,
    'video-thumb': 1,
  });
});

it('fails when a prepared project blob entry is missing', async () => {
  await expect(
    assertPreparedProjectBlobsAvailable(createPreparedDomains(), createMissingProjectBlobZip())
  ).rejects.toThrow('project-asset');
});

it('leaves earlier operation journals to recovery when later project-export staging fails', async () => {
  const prepared = createPreparedDomains();
  const project = prepared.videoProjects[0]!;
  project.descriptor.projectAssets = [];
  const first = project.descriptor.projectExports[0]!;
  project.descriptor.projectExports.push({
    ...first,
    entry: { ...first.entry, id: 'export-2', recordingId: 'recording-2' },
    recording: {
      ...first.recording,
      blobPath: 'recording-2',
      entry: { ...first.recording.entry, id: 'recording-2' },
    },
  });
  const zip = new JSZip();
  prepared.restoredBlobs = new Map();
  assetMocks.streamAsset
    .mockResolvedValueOnce(createPreparedAsset('asset-1'))
    .mockRejectedValueOnce(new Error('second staging failed'));
  assetMocks.createJournal.mockResolvedValueOnce({ journalId: 'journal-1' });

  await expect(stagePreparedProjectAssets(prepared, zip, 'restore-1')).rejects.toThrow(
    'second staging failed'
  );

  expect(assetMocks.deleteObject).not.toHaveBeenCalled();
  expect(assetMocks.deleteJournal).not.toHaveBeenCalled();
  expect(assetMocks.discard).not.toHaveBeenCalled();
});

it('discards only the current unpublished object when journal creation fails', async () => {
  const prepared = createPreparedDomains();
  prepared.videoProjects[0]!.descriptor.projectAssets = [];
  const zip = new JSZip();
  prepared.restoredBlobs = new Map();
  assetMocks.streamAsset.mockResolvedValueOnce(createPreparedAsset('asset-current'));
  assetMocks.createJournal.mockRejectedValueOnce(new Error('journal failed'));
  assetMocks.discard.mockResolvedValueOnce(undefined);

  await expect(stagePreparedProjectAssets(prepared, zip, 'restore-1')).rejects.toThrow(
    'journal failed'
  );

  expect(assetMocks.discard).toHaveBeenCalledWith('asset-current');
});

function createPreparedAsset(assetId: string) {
  return {
    ref: {
      assetId,
      createdAt: 1,
      location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      mimeType: 'video/webm',
      sha256: null,
      size: 5,
    },
  };
}
