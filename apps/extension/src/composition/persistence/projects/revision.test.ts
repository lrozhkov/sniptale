import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EFFECT_BUNDLE_CORPUS,
  readEffectBundleCorpusArchive,
} from '../../../../../../tooling/test/support/effect-v1-corpus.test-support';
import { importEffectBundleZip } from '../../../features/video/project/effect-bundle/import/zip';
import { verifyVideoProjectEffectSnapshotIntegrity } from '../../../features/video/project/effect-instance/integrity';
import {
  createVideoProjectEntry,
  createVideoProjectEntryWithMediaClip,
} from './index.test-support';
import { isCurrentVideoProjectSnapshot } from './revision';
import { parseVideoProjectEntryResult } from './read-guards';

const mocks = vi.hoisted(() => ({ initDB: vi.fn(), get: vi.fn(), put: vi.fn(), delete: vi.fn() }));

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: mocks.initDB,
  VIDEO_PROJECTS_STORE: 'video_projects',
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.initDB.mockResolvedValue({ get: mocks.get, put: mocks.put, delete: mocks.delete });
});

afterEach(() => vi.restoreAllMocks());

function textEntry() {
  return createVideoProjectEntryWithMediaClip({
    version: 5,
    textDocuments: [
      {
        id: 'text-document',
        binding: { kind: 'project' },
        document: {
          version: 1,
          fragments: [
            {
              id: 'phrase',
              text: 'Current text',
              originalText: 'Original text',
              start: 1,
              end: 3,
              revision: 0,
              timingRevision: 0,
              alignment: 'manual',
              timeDomain: 'result',
              showInVideo: true,
            },
          ],
        },
      },
    ],
  });
}

describe('isCurrentVideoProjectSnapshot', () => {
  it('reads the exact canonical row and accepts the same ready snapshot without writes', async () => {
    const entry = textEntry();
    const snapshot = structuredClone(entry.project);
    const before = structuredClone(entry);
    mocks.get.mockResolvedValue(entry);
    await expect(isCurrentVideoProjectSnapshot(snapshot, 0)).resolves.toBe(true);
    expect(mocks.initDB).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith('video_projects', snapshot.id);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(entry).toEqual(before);
    expect(snapshot).toEqual(before.project);
  });

  it('admits a legacy missing revision only as revision zero', async () => {
    const entry = createVideoProjectEntry();
    delete entry.workspaceRevision;
    mocks.get.mockResolvedValue(entry);
    await expect(isCurrentVideoProjectSnapshot(entry.project, 0)).resolves.toBe(true);
    await expect(isCurrentVideoProjectSnapshot(entry.project, 1)).resolves.toBe(false);
  });

  it.each([
    'revision',
    'identity',
    'project-identity',
    'text',
    'placement',
    'binding',
    'timestamp',
  ] as const)(
    'refuses changed canonical %s including restored content with the same revision and timestamp',
    async (change) => {
      const entry = textEntry();
      const snapshot = structuredClone(entry.project);
      switch (change) {
        case 'revision':
          entry.workspaceRevision = 1;
          break;
        case 'identity':
          entry.id = 'other-project';
          break;
        case 'project-identity':
          entry.project.id = 'other-project';
          break;
        case 'text':
          entry.project.textDocuments![0]!.document.fragments[0]!.text = 'Restored text';
          break;
        case 'placement':
          entry.project.clips[0]!.startTime += 1;
          break;
        case 'binding': {
          const clip = entry.project.clips[0]!;
          if (clip.type !== 'VIDEO') throw new Error('Expected video fixture');
          entry.project.textDocuments![0]!.binding = {
            kind: 'source',
            assetId: clip.assetId,
            sourceInstanceId: clip.id,
          };
          entry.project.textDocuments![0]!.document.fragments[0]!.timeDomain = 'source';
          break;
        }
        case 'timestamp':
          entry.project.updatedAt += 1;
          break;
      }
      mocks.get.mockResolvedValue(entry);
      if (['text', 'placement', 'binding', 'timestamp'].includes(change))
        expect(parseVideoProjectEntryResult(entry).status).toBe('ready');
      await expect(isCurrentVideoProjectSnapshot(snapshot, 0)).resolves.toBe(false);
    }
  );

  it.each(['deleted', 'invalid', 'unsupported', 'trashed', 'invalid-revision'] as const)(
    'refuses %s canonical rows',
    async (state) => {
      const entry = createVideoProjectEntry();
      let row: unknown = entry;
      switch (state) {
        case 'deleted':
          row = undefined;
          break;
        case 'invalid':
          row = { id: entry.id, project: {} };
          break;
        case 'unsupported':
          row = { ...entry, project: { ...entry.project, templateInstances: [] } };
          break;
        case 'trashed':
          entry.lifecycle = {
            storageClass: 'library',
            savedAt: 100,
            updatedAt: 100,
            trashedAt: 100,
          };
          break;
        case 'invalid-revision':
          entry.workspaceRevision = -1;
          break;
      }
      mocks.get.mockResolvedValue(row);
      await expect(isCurrentVideoProjectSnapshot(entry.project, 0)).resolves.toBe(false);
    }
  );

  it('propagates storage failure for caller refusal', async () => {
    const failure = new Error('Storage unavailable');
    mocks.get.mockRejectedValue(failure);
    await expect(isCurrentVideoProjectSnapshot(createVideoProjectEntry().project, 0)).rejects.toBe(
      failure
    );
    mocks.initDB.mockRejectedValue(failure);
    await expect(isCurrentVideoProjectSnapshot(createVideoProjectEntry().project, 0)).rejects.toBe(
      failure
    );
  });

  it('compares effect source and digest metadata after full validation without reading Blob bytes or hashing', async () => {
    const corpus = EFFECT_BUNDLE_CORPUS.find(
      ({ accepted, artifact }) => accepted && artifact.includes('asset-bearing-conformance')
    );
    if (!corpus) throw new Error('Missing asset-bearing effect fixture');
    const imported = await importEffectBundleZip(readEffectBundleCorpusArchive(corpus));
    if (!imported.ok) throw new Error('Invalid effect fixture');
    const document = imported.bundle.documents[0]!;
    const entry = createVideoProjectEntry({
      effectSnapshots: [
        {
          id: `effect:${document.sha256}`,
          documentId: document.document.id,
          kind: document.document.kind,
          schemaVersion: 'sniptale.effect.v1',
          sha256: document.sha256,
          source: document.source,
          retainedByteLength:
            new TextEncoder().encode(document.source).byteLength +
            document.assets.reduce((total, asset) => total + asset.byteLength, 0),
          assets: document.assets.map((asset) => ({
            blob: new Blob([Uint8Array.from(asset.bytes).buffer], { type: asset.mimeType }),
            id: asset.id,
            kind: asset.kind,
            byteLength: asset.byteLength,
            mimeType: asset.mimeType,
            sha256: asset.sha256,
          })),
        },
      ],
    });
    await verifyVideoProjectEffectSnapshotIntegrity(entry.project);
    const snapshot = structuredClone(entry.project);
    const readBytes = vi.spyOn(Blob.prototype, 'arrayBuffer');
    const digest = vi.spyOn(crypto.subtle, 'digest');
    mocks.get.mockResolvedValue(entry);
    await expect(isCurrentVideoProjectSnapshot(snapshot, 0)).resolves.toBe(true);
    const effect = entry.project.effectSnapshots![0]!;
    effect.source += ' ';
    await expect(isCurrentVideoProjectSnapshot(snapshot, 0)).resolves.toBe(false);
    effect.source = snapshot.effectSnapshots![0]!.source;
    effect.assets[0]!.sha256 = '0'.repeat(64);
    await expect(isCurrentVideoProjectSnapshot(snapshot, 0)).resolves.toBe(false);
    expect(readBytes).not.toHaveBeenCalled();
    expect(digest).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });
});
