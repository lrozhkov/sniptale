import { beforeEach, expect, it, vi } from 'vitest';
import { openArchiveReader, createArchiveWriter } from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { MAX_MEDIA_ARCHIVE_ENTRIES } from '../../../composition/archive-transfer';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from './export';
import { parseManifestV6, parseBoundedJson, assertMetadataJson } from './codec';
import { inspectMediaHubBackupV6 } from './inspect';
import { parseLegacyV3Manifest } from './fixtures/legacy-v3-manifest-reader.test-support';
import { parseBackupRootEnvelope } from './shared-object-envelope';
import { decodeBackupMetadata } from './metadata-transport';
import { parsePortableMediaMetadata } from './root-codecs/media';
import { prepareVideoReviewRestore } from '../../../composition/persistence/review-workspaces/backup-restore';
import type { MediaHubBackupRootInventoryItem } from './contracts';

const mocks = vi.hoisted(() => ({ verify: vi.fn(), stage: vi.fn(), publish: vi.fn() }));
vi.mock('./restore-session', () => ({ verifyMediaHubRestoreResume: mocks.verify }));
vi.mock('./staging', () => ({ stageArchiveRootObjects: mocks.stage }));
vi.mock('../../../composition/persistence/assets', async (original) => ({
  ...(await original<typeof import('../../../composition/persistence/assets')>()),
  publishReadyJournalWithRetry: mocks.publish,
}));
import { restoreMediaHubBackupV6 } from './restore';

beforeEach(() => vi.clearAllMocks());

function roots(withProject: boolean): MediaHubBackupRootInventoryItem[] {
  const blob = new Blob(['source'], { type: 'video/webm' });
  return ['one', 'two'].map((id) => {
    const rootId = `recording:${id}`;
    return {
      descriptor: {
        rootKind: 'media',
        mediaSubtype: 'library-item',
        rootId,
        metadataPath: `_sniptale/metadata/media/recording%3A${id}.json`,
        objectCount: 1,
        totalBytes: blob.size,
      },
      summary: {
        draftCount: 0,
        recordingCount: 1,
        sourceMetadataCount: 0,
        telemetryCount: 0,
        thumbnailCount: 0,
        webSnapshotCount: 0,
      },
      load: vi.fn(async () => {
        const metadata: unknown = {
          entry: {
            id: rootId,
            kind: 'recording',
            filename: `${id}.webm`,
            originalFilename: `${id}.webm`,
            source: { kind: 'recording', recordingId: id },
            mimeType: 'video/webm',
            size: blob.size,
            duration: 2,
            width: 640,
            height: 360,
            createdAt: 1,
            updatedAt: 2,
            sourceUrl: null,
            sourceTitle: null,
            sourceFavicon: null,
            tags: [],
          },
          originalObjectId: `source-${id}`,
          recording: {
            entry: {
              id,
              filename: `${id}.webm`,
              mimeType: 'video/webm',
              size: blob.size,
              createdAt: 1,
            },
          },
          videoReview: {
            workspace: {
              aggregateId: rootId,
              formatVersion: withProject ? 3 : 1,
              ...(withProject
                ? {
                    project: {
                      name: `Project ${id}`,
                      lifecycle: {
                        storageClass: 'library',
                        savedAt: 1,
                        updatedAt: 2,
                        trashedAt: 3,
                      },
                    },
                  }
                : {}),
              source: {
                duration: 2,
                width: 640,
                height: 360,
                mimeType: 'video/webm',
                size: blob.size,
              },
              revision: 2,
              cursor: 0,
              history: [],
              advanced: createQuickEditAdvancedState(),
              createdAt: 1,
              updatedAt: 2,
            },
            draft: null,
          },
        };
        assertMetadataJson(metadata);
        return {
          metadata,
          objects: [
            {
              blob,
              ref: {
                objectId: `source-${id}`,
                filename: `${id}.webm`,
                mimeType: blob.type,
                path:
                  id === 'one'
                    ? `Recordings/${id}.webm`
                    : `_sniptale/assets/source-${id}/${id}.webm`,
                size: blob.size,
              },
            },
          ],
        };
      }),
    };
  });
}

async function archive(withProject: boolean) {
  const items = roots(withProject);
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: buildMediaHubBackupExportPlanV6({
      layout: 'library-folders-v3',
      roots: items,
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    }),
    sink: output.sink,
  });
  for (const item of items) expect(item.load).toHaveBeenCalledTimes(1);
  return output.blob();
}

it.each([false, true])(
  'exports admitted project inventory=%s with deduplicated bytes and full portable metadata',
  async (withProject) => {
    const file = await archive(withProject);
    const inspection = await inspectMediaHubBackupV6(file);
    expect(inspection.manifest.layout).toBe(
      withProject ? 'library-folders-v4' : 'library-folders-v3'
    );
    expect(inspection.rootKeys).toHaveLength(2);
    if (!withProject)
      expect(parseLegacyV3Manifest(inspection.manifest)).toEqual(inspection.manifest);
    expect(
      inspection.manifest.sharedObjects?.filter((object) => object.mimeType === 'video/webm')
    ).toHaveLength(1);
    const reader = await openArchiveReader(file);
    try {
      for (const id of ['one', 'two']) {
        const raw = parseBoundedJson(
          await reader.entry(`_sniptale/metadata/media/recording%3A${id}.json`)!.text(1024 * 1024)
        );
        const envelope = parseBackupRootEnvelope(raw, inspection.manifest).envelope;
        const decoded = await decodeBackupMetadata(reader, envelope);
        const metadata = parsePortableMediaMetadata(decoded.envelope.metadata);
        const restored = prepareVideoReviewRestore({
          review: metadata.videoReview!,
          sourceAggregateId: metadata.entry.id,
          targetAggregateId: `recording:new-${id}`,
          sourceAssetId: `new-source-${id}`,
        });
        expect(restored.workspace.aggregateId).toBe(`recording:new-${id}`);
        expect(restored.workspace.history).toEqual(metadata.videoReview!.workspace.history);
        expect(restored.workspace.project).toEqual(
          withProject
            ? {
                name: `Project ${id}`,
                lifecycle: { storageClass: 'library', savedAt: 1, updatedAt: 2, trashedAt: 3 },
              }
            : undefined
        );
      }
    } finally {
      await reader.close();
    }
  }
);

it('rejects the two-root v4 archive through released admission before any staging or publication', async () => {
  const file = await archive(true);
  mocks.verify.mockImplementation(async ({ file }: { file: Blob }) => {
    const reader = await openArchiveReader(file);
    try {
      parseLegacyV3Manifest(
        parseBoundedJson(await reader.entry('_sniptale/manifest.json')!.text(1024 * 1024))
      );
    } finally {
      await reader.close();
    }
    throw new Error('Legacy fixture unexpectedly admitted the new layout.');
  });
  await expect(
    restoreMediaHubBackupV6({ file, operationId: 'legacy-restore', publishers: [] })
  ).rejects.toThrow('Unsupported media backup v6 layout');
  expect(mocks.stage).not.toHaveBeenCalled();
  expect(mocks.publish).not.toHaveBeenCalled();
});

it('keeps the v3 resource ceiling and refuses unknown layouts in v4 admission', async () => {
  const manifest = (await inspectMediaHubBackupV6(await archive(true))).manifest;
  expect(() =>
    parseManifestV6({
      ...manifest,
      totals: { ...manifest.totals, objects: MAX_MEDIA_ARCHIVE_ENTRIES + 1 },
    })
  ).toThrow('resource profile');
  expect(() => parseManifestV6({ ...manifest, layout: 'library-folders-v5' })).toThrow(
    'Unsupported'
  );
});

it('refuses new project metadata hidden in a legacy archive before restore', async () => {
  const file = await archive(true);
  const reader = await openArchiveReader(file);
  const output = createArchiveMemorySink();
  const writer = createArchiveWriter(output.sink);
  try {
    for (const info of reader.entries()) {
      const entry = reader.entry(info.path)!;
      if (entry.path === '_sniptale/manifest.json') {
        const manifest = parseBoundedJson(await entry.text(1024 * 1024));
        const admitted = parseManifestV6(manifest);
        await writer.addText(
          entry.path,
          JSON.stringify({ ...admitted, layout: 'library-folders-v3' })
        );
      } else {
        const chunks: ArrayBuffer[] = [];
        await entry.pipeTo(
          new WritableStream({
            write(chunk: Uint8Array) {
              chunks.push(new Uint8Array(chunk).buffer);
            },
          })
        );
        await writer.addBlob(entry.path, new Blob(chunks));
      }
    }
    await writer.close();
  } finally {
    await reader.close();
  }
  await expect(inspectMediaHubBackupV6(output.blob())).rejects.toThrow(
    'requires library-folders-v4'
  );
});
