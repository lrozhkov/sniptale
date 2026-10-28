import { expect, it, vi } from 'vitest';
import type { ArchiveReader } from '../../../../composition/archive-transfer';
import type { JsonValue, MediaHubBackupRootEnvelope } from '../contracts';
import { assertArchiveRootObjectInventory } from './object-inventory';
import { DEFAULT_EDITOR_FRAME_SETTINGS } from '../../../../features/editor/document/constants';
import { assertMetadataJson } from '../codec';
import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import { createArchiveMemorySink } from '../../../../composition/archive-transfer/test-support';
import { openArchiveReader } from '../../../../composition/archive-transfer';
import { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } from '../export';
import { inspectMediaHubBackupV6 } from '../inspect';
import { parseManifestV6 } from '../codec';

const reader: ArchiveReader = { close: vi.fn(), entries: () => [], entry: () => null };
const object = {
  objectId: 'body',
  path: 'Screenshots/one.png',
  filename: 'one.png',
  mimeType: 'image/png',
  size: 3,
};
function envelope(
  kind: 'media' | 'scenario-project' | 'video-project',
  metadata: JsonValue
): MediaHubBackupRootEnvelope {
  const common = {
    rootId: 'root',
    metadataPath: '_sniptale/metadata/media/root.json',
    objectCount: 1,
    totalBytes: 3,
  };
  return {
    descriptor:
      kind === 'media'
        ? { ...common, rootKind: kind, mediaSubtype: 'library-item' }
        : { ...common, rootKind: kind },
    metadata,
    objects: [object],
  };
}
const media = (mimeType = 'image/png') =>
  envelope('media', {
    entry: { id: 'root', tags: [], source: { kind: 'screenshot' }, mimeType, size: 3 },
    originalObjectId: 'body',
  });
const scenario = (mimeType = 'image/png') =>
  envelope('scenario-project', {
    entry: { id: 'root', project: {} },
    assets: [{ entry: { id: 'asset', mimeType, size: 3 }, objectId: 'body' }],
    exports: [],
    exportThumbnails: [],
    stepDocuments: [],
  });
const video = (mimeType = 'image/png') =>
  envelope('video-project', {
    entry: {
      id: 'root',
      project: { assets: [{ source: { kind: 'project-asset', projectAssetId: 'asset' } }] },
    },
    projectAssets: [
      {
        entry: { id: 'asset', mimeType, size: 3 },
        filename: 'one.png',
        objectId: 'body',
      },
    ],
    projectExports: [],
  });

it.each([false, true])(
  'refuses unsupported Scenario MIME before staging (shared=%s)',
  async (shared) => {
    const blob = new Blob(['video'], { type: 'video/webm' });
    const roots = Array.from({ length: shared ? 2 : 1 }, (_, index) => {
      const id = `scenario-${index}`;
      const objectId = `body-${index}`;
      const item = scenario();
      item.metadata = {
        entry: { id, project: {} },
        assets: [{ entry: { id: objectId, mimeType: blob.type, size: blob.size }, objectId }],
        exports: [],
        exportThumbnails: [],
        stepDocuments: [],
      };
      return {
        descriptor: {
          ...item.descriptor,
          rootId: id,
          metadataPath: `_sniptale/metadata/scenario-projects/${id}.json`,
          totalBytes: blob.size,
        },
        load: async () => ({
          metadata: item.metadata,
          objects: [
            {
              blob,
              ref: {
                ...object,
                objectId,
                filename: 'body.webm',
                path: `_sniptale/assets/${objectId}/body.webm`,
                mimeType: blob.type,
                size: blob.size,
              },
            },
          ],
        }),
        summary: {
          draftCount: 0,
          recordingCount: 0,
          sourceMetadataCount: 0,
          telemetryCount: 0,
          thumbnailCount: 0,
          webSnapshotCount: 0,
        },
      };
    });
    const plan = buildMediaHubBackupExportPlanV6({
      layout: 'library-folders-v3',
      roots,
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    });
    const sink = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: sink.sink });
    const file = sink.blob();
    const archive = await openArchiveReader(file);
    try {
      const manifest = parseManifestV6(
        JSON.parse(await archive.entry('_sniptale/manifest.json')!.text())
      );
      expect(manifest.sharedObjects).toHaveLength(shared ? 1 : 0);
    } finally {
      await archive.close();
    }
    await expect(inspectMediaHubBackupV6(file)).rejects.toThrow('Unsupported scenario asset MIME');
  }
);

function imageDocument(): JsonValue {
  const { backgroundImageData: _background, ...frame } = DEFAULT_EDITOR_FRAME_SETTINGS;
  const value = {
    version: 3,
    sourceImage: { objectId: 'body' },
    sourceName: 'one.png',
    sourceWidth: 100,
    sourceHeight: 80,
    canvasWidth: 100,
    canvasHeight: 80,
    sourceLeft: 0,
    sourceTop: 0,
    sourceDisplayWidth: 100,
    sourceDisplayHeight: 80,
    frame: { ...frame, backgroundImage: null },
    canvasJson: '{"objects":[]}',
    assets: [{ objectId: 'body', role: 'source-image' }],
  };
  assertMetadataJson(value);
  return value;
}

function metadata(root: MediaHubBackupRootEnvelope) {
  if (!root.metadata || typeof root.metadata !== 'object' || Array.isArray(root.metadata))
    throw new Error('Invalid test metadata.');
  return root.metadata;
}

it('admits compatible document, thumbnail and presentation roles without multiplying object IDs', async () => {
  const root = media();
  const value = metadata(root);
  value['workspace'] = { document: imageDocument() };
  value['thumbnail'] = { objectId: 'body' };
  value['presentation'] = { entry: {}, thumbnailObjectId: 'body', previewObjectId: 'body' };
  await assertArchiveRootObjectInventory(root, reader, []);
  root.objects = [];
  await expect(assertArchiveRootObjectInventory(root, reader, [])).rejects.toThrow();
});

it('admits Web snapshot package and screenshot with their separate MIME and size roles', async () => {
  const root = media();
  root.metadata = {
    entry: {
      id: 'root',
      kind: 'web-archive',
      tags: [],
      source: { kind: 'web-snapshot' },
      mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
      size: 3,
    },
    originalObjectId: 'body',
    webSnapshot: {
      packageObjectId: 'body',
      screenshotObjectId: 'raster',
      entry: { size: 3, screenshotSize: 4, screenshotMimeType: 'image/png' },
    },
  };
  root.objects = [
    { ...object, mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE },
    { ...object, objectId: 'raster', path: 'Screenshots/raster.png', size: 4 },
  ];
  await assertArchiveRootObjectInventory(root, reader, []);
});

it('admits Scenario document, thumbnail and presentation resources with one compatible object', async () => {
  const root = scenario();
  const value = metadata(root);
  value['stepDocuments'] = [{ projectId: 'root', stepId: 'step', document: imageDocument() }];
  value['exportThumbnails'] = [{ exportId: 'export', thumbnail: { objectId: 'body' } }];
  value['thumbnail'] = { objectId: 'body' };
  value['presentation'] = { entry: {}, thumbnailObjectId: 'body' };
  await assertArchiveRootObjectInventory(root, reader, []);
});

it('admits Video export, thumbnail, presentation and immutable effect resource roles', async () => {
  const root = video();
  const value = metadata(root);
  value['projectExports'] = [
    { entry: { id: 'export', size: 3 }, objectId: 'export', thumbnail: { objectId: 'body' } },
  ];
  value['thumbnail'] = { objectId: 'body' };
  value['presentation'] = { entry: {}, thumbnailObjectId: 'body', previewObjectId: 'body' };
  value['entry'] = {
    id: 'root',
    project: {
      assets: [{ source: { kind: 'project-asset', projectAssetId: 'asset' } }],
      effectSnapshots: [
        {
          assets: [
            { objectId: 'body', mimeType: 'image/png', byteLength: 3, sha256: 'a'.repeat(64) },
          ],
        },
      ],
    },
  };
  root.objects.push({
    ...object,
    objectId: 'export',
    path: 'Exports/one.webm',
    mimeType: 'video/webm',
  });
  await assertArchiveRootObjectInventory(root, reader, []);
});

it.each([1, [{}], [{ assets: ['bad'] }], [{ assets: [{ objectId: 'body', sha256: 0 }] }]])(
  'refuses malformed Video effect inventory %#',
  async (effectSnapshots) => {
    const root = video();
    metadata(root)['entry'] = {
      id: 'root',
      project: {
        assets: [{ source: { kind: 'project-asset', projectAssetId: 'asset' } }],
        effectSnapshots,
      },
    };
    await expect(assertArchiveRootObjectInventory(root, reader, [])).rejects.toThrow('effect');
  }
);

it.each([media, scenario, video])(
  'admits each typed body role without changing authored metadata %#',
  async (fixture) => {
    for (const mimeType of ['image/png', 'image/png; name="source.png"']) {
      const root = fixture(mimeType);
      const before = structuredClone(root);
      await assertArchiveRootObjectInventory(root, reader, []);
      expect(root).toEqual(before);
    }
  }
);

it.each(['missing', 'unused', 'size', 'mime'] as const)(
  'refuses typed inventory %s',
  async (kind) => {
    const root = media();
    if (kind === 'missing') root.objects = [];
    if (kind === 'unused')
      root.objects.push({ ...object, objectId: 'unused', path: 'Screenshots/unused.png' });
    if (kind === 'size') root.objects = [{ ...object, size: 4 }];
    if (kind === 'mime') root.objects = [{ ...object, mimeType: 'audio/wav' }];
    await expect(assertArchiveRootObjectInventory(root, reader, [])).rejects.toThrow();
  }
);

it('admits effect roles and rejects conflicting shared digests', async () => {
  const digest = 'a'.repeat(64);
  const root = media();
  root.descriptor = { ...root.descriptor, rootKind: 'media', mediaSubtype: 'effect-bundle' };
  root.metadata = {
    entry: {
      packId: 'root',
      version: '1',
      documents: [{}],
      retainedByteLength: 3,
      assets: [
        { objectId: 'body', mimeType: 'image/png', byteLength: 3, kind: 'image', sha256: digest },
      ],
    },
  };
  await assertArchiveRootObjectInventory(root, reader, []);
  await expect(
    assertArchiveRootObjectInventory(root, reader, [
      {
        id: 'shared',
        path: object.path,
        mimeType: object.mimeType,
        size: object.size,
        sha256: 'b'.repeat(64),
      },
    ])
  ).rejects.toThrow('digest');
});

it('checks saved history JSON before staging and refuses an absent sidecar', async () => {
  const metadata: JsonValue = {
    entry: { id: 'root', project: {} },
    assets: [],
    exports: [],
    exportThumbnails: [],
    stepDocuments: [],
    historyObjectId: 'body',
  };
  const root = envelope('scenario-project', metadata);
  root.objects = [{ ...object, mimeType: 'application/json', size: 2 }];
  await expect(assertArchiveRootObjectInventory(root, reader, [])).rejects.toThrow(
    'history is missing'
  );
  const json: ArchiveReader = {
    ...reader,
    entry: () => ({
      ...object,
      compressedSize: 2,
      crc32: 0,
      directory: false,
      size: 2,
      pipeTo: vi.fn(),
      text: async () => '[]',
    }),
  };
  await assertArchiveRootObjectInventory(root, json, []);
  await expect(
    assertArchiveRootObjectInventory(
      root,
      {
        ...json,
        entry: () => ({
          ...object,
          compressedSize: 2,
          crc32: 0,
          directory: false,
          pipeTo: vi.fn(),
          text: async () => '{}',
        }),
      },
      []
    )
  ).rejects.toThrow('history');
});

it('admits exact Scenario history roles without bytes only for metadata discovery', async () => {
  const root = scenario();
  const metadata = root.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata))
    throw new Error('Expected Scenario metadata.');
  root.metadata = { ...metadata, historyObjectId: 'history' };
  root.objects.push({
    objectId: 'history',
    path: 'Metadata/history.json',
    filename: 'history.json',
    mimeType: 'application/json',
    size: 2,
  });
  root.descriptor.objectCount = 2;
  root.descriptor.totalBytes = 5;
  await expect(assertArchiveRootObjectInventory(root, null, [])).resolves.toBeUndefined();
  await expect(assertArchiveRootObjectInventory(root, reader, [])).rejects.toThrow(
    'history is missing'
  );
  root.objects[1]!.mimeType = 'text/html';
  await expect(assertArchiveRootObjectInventory(root, null, [])).rejects.toThrow();
});
