import { expect, it } from 'vitest';
import {
  createArchivePathAllocator,
  openArchiveReader,
} from '../../../composition/archive-transfer';
import { createArchiveMemorySink } from '../../../composition/archive-transfer/test-support';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { DEFAULT_WINDOW_HEADER } from '../../../features/browser-frame/header';
import { encodePortableReviewAssetRefs } from '../../../composition/persistence/review-workspaces/asset-refs';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { prepareVideoReviewRestore } from '../../../composition/persistence/review-workspaces/backup-restore';
import { createVideoProjectEntryWithMediaClip } from '../../../composition/persistence/projects/index.test-support';
import { createEditorDocumentFixture } from '../../../editor/document/page-session/document.test-support';
import { createPersistedEditorDocumentFixture } from '../../../composition/persistence/document-assets/test-support';
import {
  encodePortableEditorDocument,
  decodePortableEditorDocument,
} from './root-codecs/editor-document';
import {
  encodePortableVideoProjectAssetRefs,
  parsePortableVideoProjectMetadata,
} from './root-codecs/projects';
import { parsePortableMediaMetadata } from './root-codecs/media';
import { assertMetadataJson, parseRootEnvelope, parseArchiveRootDescriptor } from './codec';
import {
  buildMediaHubBackupExportPlanV6,
  exportMediaHubBackupV6,
  type MediaHubBackupRootInventoryItem,
} from './export';
import { decodeBackupMetadata, encodeBackupMetadata } from './metadata-transport';
import { inspectMediaHubBackupV6 } from './inspect';
import { MAX_ROOT_METADATA_BYTES, MAX_EXPANDED_ROOT_METADATA_BYTES } from './contracts';

const favicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
const header = {
  ...DEFAULT_WINDOW_HEADER,
  faviconEnabled: true,
  faviconSource: 'file' as const,
  faviconDataUrl: favicon,
};

function recordingMetadata(text = 'data: ordinary text', count = 1) {
  return {
    entry: {
      id: 'recording:one',
      kind: 'recording',
      filename: 'one.webm',
      originalFilename: 'one.webm',
      source: { kind: 'recording', recordingId: 'one' },
      mimeType: 'video/webm',
      createdAt: 1,
      updatedAt: 1,
      duration: 2,
      size: 6,
      width: 640,
      height: 360,
      sourceUrl: null,
      sourceTitle: null,
      sourceFavicon: null,
      tags: [],
    },
    originalObjectId: 'original',
    recording: {
      entry: { id: 'one', filename: 'one.webm', createdAt: 1, mimeType: 'video/webm', size: 6 },
    },
    videoReview: {
      workspace: {
        aggregateId: 'recording:one',
        formatVersion: 1,
        source: { duration: 2, width: 640, height: 360, size: 6, mimeType: 'video/webm' },
        revision: 1,
        cursor: 0,
        history: Array.from({ length: count }, (_, index) => ({
          id: `op-${index}`,
          at: 1,
          target: 'annotation',
          before: null,
          after: { id: `annotation-${index}`, text, anchor: { kind: 'point', time: 1 } },
        })),
        advanced: { ...createQuickEditAdvancedState(), windowHeader: header },
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    },
  };
}

function inventory(
  metadata: unknown,
  rootKind: 'media' | 'video-project' = 'media',
  rootId = 'recording:one'
): MediaHubBackupRootInventoryItem {
  assertMetadataJson(metadata);
  const paths = createArchivePathAllocator();
  const blob = new Blob(['source'], { type: 'video/webm' });
  const profile = rootKind === 'media' ? 'media' : 'video-projects';
  return {
    descriptor: parseArchiveRootDescriptor({
      rootKind,
      ...(rootKind === 'media' ? { mediaSubtype: 'library-item' as const } : {}),
      rootId,
      metadataPath: `_sniptale/metadata/${profile}/${encodeURIComponent(rootId)}.json`,
      objectCount: 1,
      totalBytes: blob.size,
    }),
    load: async () => ({
      metadata,
      objects: [
        {
          blob,
          ref: {
            objectId: 'original',
            path: paths.reserve(['Recordings', 'source.webm']),
            filename: 'source.webm',
            mimeType: blob.type,
            size: blob.size,
          },
        },
      ],
    }),
    summary: {
      draftCount: 0,
      recordingCount: 1,
      sourceMetadataCount: 0,
      telemetryCount: 0,
      thumbnailCount: 0,
      webSnapshotCount: 0,
    },
  };
}

async function roundtrip(item: MediaHubBackupRootInventoryItem) {
  const output = createArchiveMemorySink();
  await exportMediaHubBackupV6({
    plan: buildMediaHubBackupExportPlanV6({
      layout: 'library-folders-v2',
      roots: [item],
      privacy: { includeSourceMetadata: true, includeTelemetry: false, includeWebSnapshots: false },
    }),
    sink: output.sink,
  });
  const inspection = await inspectMediaHubBackupV6(output.blob());
  const reader = await openArchiveReader(output.blob());
  try {
    const descriptor = inspection.descriptors[0]!;
    const raw = parseRootEnvelope(JSON.parse(await reader.entry(descriptor.metadataPath)!.text()));
    const decoded = await decodeBackupMetadata(reader, raw);
    return { raw, ...decoded };
  } finally {
    await reader.close();
  }
}

it.each([
  'data: описание URL',
  'blob: пример ссылки',
  'Qk ordinary text',
  'iVBORw0KGgo is a PNG signature',
  'A'.repeat(64) + '+/=',
])(
  'preserves authored annotation text literally after canonical read and redo: %s',
  async (text) => {
    const { envelope, raw } = await roundtrip(inventory(recordingMetadata(text)));
    expect(JSON.stringify(raw.metadata)).not.toContain('data:');
    expect(envelope.objects.map((object) => object.objectId)).toEqual(['original']);
    const review = parsePortableMediaMetadata(envelope.metadata).videoReview!;
    const restored = prepareVideoReviewRestore({
      review,
      sourceAggregateId: 'recording:one',
      targetAggregateId: 'recording:new',
      sourceAssetId: 'restored-source',
    });
    expect(restored.workspace.cursor).toBe(0);
    const redo = replayReviewHistory(restored.workspace.history, 1, restored.workspace.source);
    expect(redo.annotations[0]?.text).toBe(text);
    expect(
      replayReviewHistory(restored.workspace.history, 0, restored.workspace.source).annotations
    ).toEqual([]);
    expect(restored.workspace.advanced.windowHeader?.faviconDataUrl).toBe(favicon);
  }
);

it('roundtrips valid Cyrillic redo history above the old 4 MiB root limit without truncation', async () => {
  const text = 'я'.repeat(50_000);
  const input = recordingMetadata(text, 50);
  expect(new TextEncoder().encode(JSON.stringify(input)).byteLength).toBeGreaterThan(
    MAX_ROOT_METADATA_BYTES
  );
  const { envelope, expandedBytes } = await roundtrip(inventory(input));
  const review = parsePortableMediaMetadata(envelope.metadata).videoReview!;
  expect(review.workspace.history).toHaveLength(50);
  expect(review.workspace.cursor).toBe(0);
  expect(
    replayReviewHistory(review.workspace.history, 50, review.workspace.source).annotations[49]?.text
  ).toBe(text);
  expect(expandedBytes).toBeGreaterThan(MAX_ROOT_METADATA_BYTES);
});

it('preserves an opaque large recovery payload without parsing arbitrary legacy fields', async () => {
  const input = recordingMetadata();
  const recoveryV1 = JSON.stringify({
    legacyText: 'data: ' + 'я'.repeat(600_000),
    faviconDataUrl: favicon,
  });
  const metadata = {
    ...input,
    videoReview: {
      ...input.videoReview,
      workspace: {
        ...input.videoReview.workspace,
        advanced: { ...input.videoReview.workspace.advanced, recoveryV1 },
      },
    },
  };
  const { envelope } = await roundtrip(inventory(metadata));
  expect(
    parsePortableMediaMetadata(envelope.metadata).videoReview?.workspace.advanced.recoveryV1
  ).toBe(recoveryV1);
});

it('preserves serialized Canvas above 1 MiB and rejects resource URLs at the document owner', async () => {
  const document = createPersistedEditorDocumentFixture(createEditorDocumentFixture(), 'source');
  const text = 'data: ' + 'я'.repeat(600_000);
  document.canvasJson = JSON.stringify({ objects: [{ type: 'textbox', text }] });
  const portable = encodePortableEditorDocument({
    document,
    objectsByAssetId: new Map([['source', 'original']]),
  });
  const input = recordingMetadata();
  const { videoReview: _review, recording: _recording, ...rest } = input;
  const metadata = {
    ...rest,
    entry: {
      ...rest.entry,
      id: 'image',
      kind: 'image',
      mimeType: 'image/png',
      source: { kind: 'stored-asset' },
    },
    workspace: { aggregateId: 'image', document: portable, createdAt: 1, updatedAt: 1 },
  };
  const { envelope } = await roundtrip(inventory(metadata, 'media', 'image'));
  const parsed = parsePortableMediaMetadata(envelope.metadata);
  const restored = decodePortableEditorDocument({
    document: parsed.workspace!.document,
    assetsByObjectId: new Map([['original', 'restored-source']]),
  });
  expect(JSON.parse(restored.canvasJson).objects[0].text).toBe(text);
  expect(() =>
    encodePortableEditorDocument({
      document: {
        ...document,
        canvasJson: JSON.stringify({ objects: [{ src: 'data:image/png;base64,AAAA' }] }),
      },
      objectsByAssetId: new Map([['source', 'original']]),
    })
  ).toThrow('invalid');
});

it('externalizes and restores authored montage clip headers', async () => {
  const base = createVideoProjectEntryWithMediaClip({ id: 'p' });
  const clip = base.project.clips[0]!;
  const metadata = {
    entry: {
      ...base,
      id: 'p',
      project: encodePortableVideoProjectAssetRefs({
        ...base.project,
        id: 'p',
        clips: [{ ...clip, windowHeader: header }],
      }),
    },
    projectAssets: [
      {
        entry: { id: 'project-asset-1', mimeType: 'video/webm', createdAt: 1, size: 6 },
        filename: 'source.webm',
        objectId: 'original',
      },
    ],
    projectExports: [],
  };
  const { envelope } = await roundtrip(inventory(metadata, 'video-project', 'p'));
  expect(
    parsePortableVideoProjectMetadata(envelope.metadata).entry.project.clips[0]
  ).toHaveProperty('windowHeader.faviconDataUrl', favicon);
});

it('rejects non-JSON structures and excessive decoded depth independently of authored strings', () => {
  expect(() => assertMetadataJson({ assetId: 'local' })).toThrow('local asset ID');
  expect(() => assertMetadataJson({ number: Infinity })).toThrow('portable JSON');
  let nested: unknown = 'text';
  for (let depth = 0; depth < 66; depth++) nested = [nested];
  expect(() => assertMetadataJson(nested)).toThrow('nesting');
});

it('aborts the direct sink if v2 domain preparation fails before writing any root', async () => {
  const metadata = recordingMetadata();
  metadata.videoReview.workspace.source.size = 7;
  const output = createArchiveMemorySink();
  await expect(
    exportMediaHubBackupV6({
      plan: buildMediaHubBackupExportPlanV6({
        layout: 'library-folders-v2',
        roots: [inventory(metadata)],
        privacy: {
          includeSourceMetadata: false,
          includeTelemetry: false,
          includeWebSnapshots: false,
        },
      }),
      sink: output.sink,
    })
  ).rejects.toMatchObject({ reason: 'metadata-invalid', phase: 'encode' });
  expect(output.aborted).toBe(true);
});

it('rejects duplicate, foreign and wrong-MIME transport references before staging', async () => {
  const encoded = await encodeBackupMetadata(inventory(recordingMetadata()), 1);
  const payload = await encoded.item.load();
  const base = {
    descriptor: encoded.item.descriptor,
    metadata: payload.metadata,
    objects: payload.objects.map((object) => object.ref),
  };
  const reader = {
    entry: (path: string) => {
      const object = payload.objects.find((item) => item.ref.path === path);
      return object
        ? {
            path,
            size: object.blob.size,
            compressedSize: object.blob.size,
            crc32: 0,
            directory: false,
            text: () => object.blob.text(),
            pipeTo: async (destination: WritableStream<Uint8Array>) =>
              object.blob.stream().pipeTo(destination),
          }
        : null;
    },
    entries: () => [],
    close: async () => {},
  };
  if (
    typeof payload.metadata !== 'object' ||
    payload.metadata === null ||
    Array.isArray(payload.metadata)
  )
    throw new Error('Missing fixture transport');
  const id = payload.metadata['payloadObjectId'];
  await expect(
    decodeBackupMetadata(reader, {
      ...base,
      metadata: { payloadObjectId: id!, faviconObjectIds: [id!] },
    })
  ).rejects.toMatchObject({ reason: 'resource-invalid' });
  await expect(
    decodeBackupMetadata(reader, {
      ...base,
      metadata: { payloadObjectId: 'foreign', faviconObjectIds: [] },
    })
  ).rejects.toMatchObject({ reason: 'resource-invalid' });
  await expect(
    decodeBackupMetadata(reader, {
      ...base,
      objects: base.objects.map((object) => ({ ...object, mimeType: 'text/plain' })),
    })
  ).rejects.toMatchObject({ reason: 'resource-invalid' });
  await expect(
    decodeBackupMetadata(reader, {
      ...base,
      objects: base.objects.map((object) =>
        object.objectId === id ? { ...object, size: MAX_EXPANDED_ROOT_METADATA_BYTES + 1 } : object
      ),
    })
  ).rejects.toMatchObject({
    reason: 'metadata-budget',
    metrics: { limit: MAX_EXPANDED_ROOT_METADATA_BYTES },
  });
  const abort = new AbortController();
  abort.abort();
  await expect(decodeBackupMetadata(reader, base, abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
  for (const object of payload.objects) {
    if (object.ref.mimeType === 'image/png')
      object.blob = new Blob(['x'.repeat(object.blob.size)], { type: 'image/png' });
  }
  await expect(decodeBackupMetadata(reader, base)).rejects.toMatchObject({
    reason: 'resource-invalid',
    resourceRole: 'favicon',
  });
});

it('round trips PCM profiles and retained WAV take refs through ZIP metadata, redo and restore remapping', async () => {
  const metadata = recordingMetadata();
  const profile = { modelId: 'pcm-model', voiceId: 'voice', responseFormat: 'pcm' as const };
  const before = reviewAdvancedContentBaseline(metadata.videoReview.workspace.advanced);
  const clip = {
    id: 'voice',
    assetId: 'project-asset:voice',
    timelineStart: 0,
    sourceOffset: 0,
    duration: 1,
    volume: 1,
    muted: false,
    fadeIn: 0,
    fadeOut: 0,
    textSnapshot: {
      kind: 'ai' as const,
      textId: 'text',
      revision: 0,
      timingRevision: 0,
      text: 'PCM fixture',
      start: 0,
      end: 1,
      timeDomain: 'result' as const,
      profile,
    },
  };
  const after = { ...before, audio: { ...before.audio, voiceover: [clip] } };
  const review = encodePortableReviewAssetRefs({
    ...metadata.videoReview,
    workspace: {
      ...metadata.videoReview.workspace,
      history: [{ id: 'pcm-apply', at: 1, target: 'advancedContent', before, after }],
      cursor: 0,
    },
  });
  const wav = new Blob(
    [
      Uint8Array.from(
        Buffer.from(
          '52494646a4bb000057415645666d74201000000001000100c05d000080bb0000020010006461746180bb0000',
          'hex'
        )
      ),
      new Uint8Array(48_000),
    ],
    { type: 'audio/wav' }
  );
  const portable = {
    ...metadata,
    videoReview: review,
    reviewAssets: [
      {
        entry: { id: 'voice', mimeType: 'audio/wav', createdAt: 1, size: wav.size },
        filename: 'voice.wav',
        objectId: 'voice',
      },
    ],
  };
  const item = inventory(portable);
  const load = item.load;
  item.descriptor = {
    ...item.descriptor,
    objectCount: 2,
    totalBytes: item.descriptor.totalBytes + wav.size,
  };
  item.load = async () => {
    const loaded = await load();
    return {
      ...loaded,
      objects: [
        ...loaded.objects,
        {
          blob: wav,
          ref: {
            objectId: 'voice',
            path: 'Recordings/voice.wav',
            filename: 'voice.wav',
            mimeType: wav.type,
            size: wav.size,
          },
        },
      ],
    };
  };
  const { envelope } = await roundtrip(item);
  const parsed = parsePortableMediaMetadata(envelope.metadata);
  expect(parsed.reviewAssets?.[0]).toMatchObject({
    filename: 'voice.wav',
    entry: { mimeType: 'audio/wav' },
  });
  const restored = prepareVideoReviewRestore({
    review: parsed.videoReview!,
    sourceAggregateId: 'recording:one',
    targetAggregateId: 'recording:restored',
    sourceAssetId: 'restored-source',
    assetIdMap: new Map([['voice', 'restored-voice']]),
  });
  const undo = replayReviewHistory(
    restored.workspace.history,
    0,
    restored.workspace.source,
    reviewAdvancedContentBaseline(restored.workspace.advanced)
  );
  const redo = replayReviewHistory(
    restored.workspace.history,
    1,
    restored.workspace.source,
    reviewAdvancedContentBaseline(restored.workspace.advanced)
  );
  expect(undo.advancedContent.audio.voiceover).toHaveLength(0);
  expect(redo.advancedContent.audio.voiceover[0]).toMatchObject({
    assetId: 'project-asset:restored-voice',
    textSnapshot: { profile },
  });
});
