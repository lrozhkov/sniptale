import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { materializeWorkspaceStorage } from '../../../../composition/persistence/review-workspaces/storage-format';
import { parseVideoWorkspace } from '../../../../composition/persistence/review-workspaces/parser';
import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ checkpoint: vi.fn(), runMutation: vi.fn() }));
vi.mock('../../../../composition/persistence/assets', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../composition/persistence/assets')>()),
  appendCommittedArchiveRootInTransaction: mocks.checkpoint,
  buildPhysicalDeleteOperation: () => ({
    assetIds: [],
    createdAt: 1,
    operationId: 'delete-1',
    status: 'pending',
    type: 'physical-delete',
  }),
  completePhysicalDeleteOperation: vi.fn(async () => undefined),
  readAssetFile: vi.fn(),
}));
vi.mock('../../../../composition/persistence/infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));

import { mediaLibraryRootPublisher } from './media';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import {
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../../features/video/review/document';
const favicon =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlH0H8AAAAASUVORK5CYII=';
import {
  annotationReviewFixture,
  journal,
  portableJson,
  portableMetadata,
  reviewFixture,
  session,
  stagedObjects,
} from './media.review-assets.test-support';

function installDatabase(
  metadata: Pick<ReturnType<typeof portableMetadata>, 'entry' | 'projectExport'>
) {
  const review = reviewFixture();
  const tables = new Map<string, Map<string, unknown>>([
    ['media_library', new Map([[metadata.entry.id, metadata.entry]])],
    ['project_exports', new Map([['e', { ...metadata.projectExport, assetId: 'old-local' }]])],
    [
      'video_workspaces',
      new Map([[metadata.entry.id, { ...review.workspace, sourceAssetId: 'old-local' }]]),
    ],
    ['video_workspace_drafts', new Map([[metadata.entry.id, review.draft]])],
  ]);
  const storeFor = (name: string) => {
    const table = tables.get(name) ?? new Map<string, unknown>();
    tables.set(name, table);
    return {
      get: async (key: IDBValidKey) =>
        table.get(Array.isArray(key) ? JSON.stringify(key) : String(key)),
      getAll: async () => [...table.values()],
      delete: async (key: IDBValidKey) =>
        table.delete(Array.isArray(key) ? JSON.stringify(key) : String(key)),
      put: async (value: Record<string, unknown>) => {
        const key =
          name === 'video_workspace_history'
            ? JSON.stringify([value['aggregateId'], value['ordinal']])
            : (value['aggregateId'] ?? value['id'] ?? value['assetId'] ?? 'other');
        table.set(String(key), structuredClone(value));
      },
      index: (indexName: string) => ({
        count: async () => 0,
        getAll: async (key: IDBValidKey) =>
          [...table.values()].filter(isRecord).filter((row) => row[indexName] === key),
        getAllKeys: async (key: IDBValidKey) =>
          [...table.values()]
            .filter(isRecord)
            .filter((row) => row[indexName] === key)
            .map((row) => {
              if (typeof row['aggregateId'] !== 'string' || typeof row['ordinal'] !== 'number')
                throw new Error('Invalid history fixture key');
              return [row['aggregateId'], row['ordinal']];
            }),
      }),
    };
  };
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({
      get: async (name: string, key: IDBValidKey) => storeFor(name).get(key),
      transaction: () => ({ objectStore: storeFor, done: Promise.resolve() }),
    })
  );
  return tables;
}

function logicalReviewValues(tables: Map<string, Map<string, unknown>>) {
  return [...(tables.get('video_workspaces')?.values() ?? [])].map((head) => {
    const ownRows = [...(tables.get('video_workspace_history')?.values() ?? [])].filter(
      (row) => isRecord(row) && isRecord(head) && row['aggregateId'] === head['aggregateId']
    );
    const workspace = parseVideoWorkspace(materializeWorkspaceStorage(head, ownRows));
    if (!workspace) throw new Error('Invalid restored workspace fixture');
    return workspace;
  });
}

beforeEach(() => vi.clearAllMocks());

it.each(
  (['skip', 'replace', 'duplicate'] as const).flatMap((strategy) =>
    [true, false].map((explicitMime) => ({ strategy, explicitMime }))
  )
)(
  'round-trips standalone review assets with $strategy and explicit MIME=$explicitMime',
  async ({ strategy, explicitMime }) => {
    const metadata = portableMetadata(explicitMime);
    const tables = installDatabase(metadata);
    const result = await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 4,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 36,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session(strategy),
      staged: stagedObjects(),
    });
    expect(result.imported).toBe(strategy !== 'skip');
    if (strategy === 'skip') return;

    const workspace = logicalReviewValues(tables).find((value) =>
      strategy === 'replace'
        ? value.aggregateId === metadata.entry.id
        : value.aggregateId !== metadata.entry.id
    );
    if (!workspace) throw new Error('Missing restored workspace');
    const refs = [
      workspace.advanced.background.enabled && workspace.advanced.background.type === 'image'
        ? workspace.advanced.background.assetId
        : null,
      workspace.advanced.audio.music[0]?.assetId,
      workspace.history[0]?.target === 'advancedContent'
        ? workspace.history[0].after.audio.voiceover[0]?.assetId
        : null,
    ];
    expect(refs.every((ref) => ref?.startsWith('project-asset:'))).toBe(true);
    expect(refs).not.toEqual(
      expect.arrayContaining([
        'project-asset:background',
        'project-asset:music',
        'project-asset:voice',
      ])
    );
    for (const ref of refs) {
      const id = ref!.slice('project-asset:'.length);
      expect(tables.get('project_assets')?.get(id)).toMatchObject({ id });
      expect(tables.get('media_library')?.get(ref!)).toMatchObject({ id: ref });
    }
    expect(result.retainedAssetIds).toEqual(
      expect.arrayContaining(['new-local', 'background-bytes', 'music-bytes', 'voice-bytes'])
    );
  }
);

it.each(['replace', 'duplicate'] as const)(
  'restores private remembered watermark bytes with %s without a Library logo card',
  async (strategy) => {
    const { createQuickEditWatermark } =
      await import('../../../../features/video/review/advanced/watermark');
    const { encodePortableReviewAssetRefs } =
      await import('../../../../composition/persistence/review-workspaces/asset-refs');
    const fixture = reviewFixture();
    const watermark = {
      ...createQuickEditWatermark('Saved brand'),
      mode: 'none' as const,
      image: { assetId: 'project-asset:logo', width: 80, height: 40, size: 0.2, opacity: 1 },
    };
    const base = portableMetadata(true);
    const metadata = {
      ...base,
      videoReview: encodePortableReviewAssetRefs({
        ...fixture,
        workspace: {
          ...fixture.workspace,
          advanced: {
            ...fixture.workspace.advanced,
            watermark,
            recoveryV1: JSON.stringify({ watermark }),
          },
          history: fixture.workspace.history.map((operation) =>
            operation.target === 'advancedContent'
              ? {
                  ...operation,
                  before: { ...operation.before, watermark },
                  after: { ...operation.after, watermark },
                }
              : operation
          ),
        },
      }),
      reviewAssets: [
        ...base.reviewAssets,
        {
          entry: { id: 'logo', mimeType: 'image/png', createdAt: 1, size: 10 },
          filename: 'logo.png',
          objectId: 'logo-object',
          publishToLibrary: false,
        },
      ],
    };
    const tables = installDatabase(metadata);
    const result = await mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 5,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 46,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session(strategy),
      staged: [
        ...stagedObjects(),
        {
          objectId: 'logo-object',
          ref: {
            assetId: 'logo-bytes',
            createdAt: 1,
            mimeType: 'image/png',
            size: 10,
            sha256: null,
            location: { kind: 'opfs', objectKey: 'objects/logo-bytes' },
          },
        },
      ],
    });
    expect(result.imported).toBe(true);
    expect(result.retainedAssetIds).toContain('logo-bytes');
    const saved = [...tables.get('project_assets')!.values()].find(
      (value) =>
        typeof value === 'object' &&
        value !== null &&
        'assetId' in value &&
        value.assetId === 'logo-bytes'
    );
    expect(saved).toMatchObject({ mimeType: 'image/png' });
    if (typeof saved !== 'object' || !saved || !('id' in saved) || typeof saved.id !== 'string')
      throw new Error('Missing restored logo');
    const reference = `project-asset:${saved.id}`;
    expect(tables.get('media_library')!.has(reference)).toBe(false);
    const restored = logicalReviewValues(tables).find((value) =>
      JSON.stringify(value).includes(reference)
    );
    expect(restored).toHaveProperty('advanced.watermark.image.assetId', reference);
  }
);

/** Source storage fixture: native bytes and a disabled intro retained by history. */
async function reviewResourceArchiveFixture(kind: 'bookends' | 'original-speech') {
  const { createNeutralPresentationSettings } =
    await import('../../../../features/video/review/advanced/presentation');
  const { readAssetFile } = await import('../../../../composition/persistence/assets');
  const base = portableMetadata(true);
  const fixture = reviewFixture();
  const image = (id: string) => ({
    assetId: `project-asset:${id}`,
    width: 20,
    height: 10,
    duration: 1,
    fit: 'contain' as const,
    fillColor: '#000000ff',
    crop: { panX: 0, panY: 0 },
  });
  const current = {
    ...createNeutralPresentationSettings(),
    outro: { mode: 'image' as const, image: image('ending') },
  };
  const previous = { ...current, intro: { mode: 'none' as const, image: image('opening') } };
  const { reviewSpeechTextSignature } =
    await import('../../../../features/video/review/speech-transcript');
  const profile = { modelId: 'speech', voiceId: 'alloy', responseFormat: 'mp3' as const };
  const originalSpeech = (ids: readonly string[]) => ({
    enabled: false,
    transcript: {
      version: 1 as const,
      phrases: [],
      profile,
      replacements: ids.map((id, index) => ({
        id,
        assetId: `project-asset:${id}`,
        phraseId: 'retained-draft',
        revision: 1,
        start: index,
        end: index + 1,
        duration: 0.5,
        text: 'Speech',
        profile,
        textSignature: reviewSpeechTextSignature('Speech', profile),
        enabled: false,
        originalVolume: 0.25,
      })),
    },
  });
  const attach = <
    T extends {
      audio: import('../../../../features/video/review/advanced/types').QuickEditAudioState;
    },
  >(
    content: T,
    history: boolean
  ) =>
    kind === 'bookends'
      ? { ...content, presentation: history ? previous : current }
      : {
          ...content,
          audio: {
            ...content.audio,
            originalSpeech: originalSpeech(history ? ['ending', 'opening'] : ['ending']),
          },
        };
  const workspace = {
    ...fixture.workspace,
    sourceAssetId: 'source-bytes',
    advanced: {
      ...attach(fixture.workspace.advanced, true),
      windowHeader: {
        ...DEFAULT_WINDOW_HEADER,
        title: 'Qk before',
        faviconEnabled: true,
        faviconSource: 'file' as const,
        faviconDataUrl: favicon,
      },
    },
    history: fixture.workspace.history.map((operation) =>
      operation.target === 'advancedContent'
        ? {
            ...operation,
            before: {
              ...attach(operation.before, true),
              windowHeader: {
                ...DEFAULT_WINDOW_HEADER,
                title: 'Qk before',
                faviconEnabled: true,
                faviconSource: 'file' as const,
                faviconDataUrl: favicon,
              },
            },
            after: {
              ...attach(operation.after, false),
              windowHeader: {
                ...DEFAULT_WINDOW_HEADER,
                title: 'data: after',
                faviconEnabled: true,
                faviconSource: 'file' as const,
                faviconDataUrl: favicon,
              },
            },
          }
        : operation
    ),
  };
  const bytes = new Map<string, File>();
  const assets = new Map<
    string,
    { id: string; assetId: string; mimeType: string; createdAt: number; size: number }
  >();
  for (const id of ['background', 'music', 'voice', 'opening', 'ending']) {
    const mimeType =
      ['music', 'voice'].includes(id) ||
      (kind === 'original-speech' && ['opening', 'ending'].includes(id))
        ? 'audio/mpeg'
        : 'image/png';
    const file = new File([`intact-${id}-bytes`], `${id}.bin`, { type: mimeType });
    bytes.set(`${id}-bytes`, file);
    assets.set(id, { id, assetId: `${id}-bytes`, mimeType, createdAt: 1, size: file.size });
  }
  bytes.set('source-bytes', new File(['source'], 'result.webm', { type: 'video/webm' }));
  const ref = (assetId: string) => ({
    assetId,
    createdAt: 1,
    mimeType: bytes.get(assetId)!.type,
    size: bytes.get(assetId)!.size,
    sha256: null,
    location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
  });
  vi.mocked(readAssetFile).mockImplementation(async (value) => {
    const file = bytes.get(value.assetId);
    if (!file) throw new Error('Missing physical fixture bytes');
    return file;
  });
  const db = {
    transaction: () => ({
      objectStore: (name: string) => ({
        index: () => ({ getAll: async () => [] }),
        get: async () => (name === 'video_workspaces' ? workspace : undefined),
      }),
      done: Promise.resolve(),
    }),
    get: async (name: string, key: unknown) => {
      if (name === 'media_library') return key === base.entry.id ? base.entry : undefined;
      if (name === 'project_exports') return { ...base.projectExport, assetId: 'source-bytes' };
      if (name === 'project_assets') return assets.get(String(key));
      if (name === 'asset_refs') return bytes.has(String(key)) ? ref(String(key)) : undefined;
      return undefined;
    },
  };
  return { base, db };
}

/** Restores physical byte objects from the ZIP, independently of logical ID remapping. */
async function stageBookendArchive(
  reader: import('../../../../composition/archive-transfer').ArchiveReader,
  envelope: ReturnType<typeof import('../codec').parseRootEnvelope>
) {
  const restoredBytes = new Map<string, File>();
  const staged = [];
  for (const object of envelope.objects) {
    const chunks: ArrayBuffer[] = [];
    await reader.entry(object.path)!.pipeTo(
      new WritableStream({
        write(chunk) {
          chunks.push(new Uint8Array(chunk).buffer);
        },
      })
    );
    const file = new File(chunks, object.filename, { type: object.mimeType });
    const assetId = `restored-${object.objectId}`;
    restoredBytes.set(assetId, file);
    staged.push({
      objectId: object.objectId,
      ref: {
        assetId,
        createdAt: 1,
        mimeType: object.mimeType,
        size: file.size,
        sha256: null,
        location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
      },
    });
  }
  return { restoredBytes, staged };
}

it.each(['bookends', 'original-speech'] as const)(
  'round-trips private current and history-only %s through real inventory, ZIP and restore',
  async (kind) => {
    const { buildMediaRootInventory } = await import('../inventory/media');
    const { createMediaHubBackupExportOptions } = await import('../options');
    const { buildMediaHubBackupExportPlanV6, exportMediaHubBackupV6 } = await import('../export');
    const { inspectMediaHubBackupV6 } = await import('../inspect');
    const { createArchivePathAllocator, openArchiveReader } =
      await import('../../../../composition/archive-transfer');
    const { createArchiveMemorySink } =
      await import('../../../../composition/archive-transfer/test-support');
    const { parseRootEnvelope } = await import('../codec');
    const { base, db } = await reviewResourceArchiveFixture(kind);
    const options = createMediaHubBackupExportOptions({ scope: 'all' });
    const roots = await buildMediaRootInventory({
      db,
      items: [
        {
          ...base.entry,
          kind: 'export',
          source: { kind: 'project-export', exportId: 'e', projectId: 'p' },
          hasThumbnail: false,
        },
      ],
      options,
      paths: createArchivePathAllocator(),
    });
    const plan = buildMediaHubBackupExportPlanV6({
      layout: 'library-folders-v2',
      roots,
      privacy: {
        includeSourceMetadata: false,
        includeTelemetry: false,
        includeWebSnapshots: false,
      },
    });
    const output = createArchiveMemorySink();
    await exportMediaHubBackupV6({ plan, sink: output.sink });
    const inspected = await inspectMediaHubBackupV6(output.blob());
    expect(inspected.manifest.totals.objects).toBe(8);
    const reader = await openArchiveReader(output.blob());
    try {
      const descriptor = inspected.descriptors[0]!;
      const transport = parseRootEnvelope(
        JSON.parse(await reader.entry(descriptor.metadataPath)!.text())
      );
      const { decodeBackupMetadata } = await import('../metadata-transport');
      const { envelope } = await decodeBackupMetadata(reader, transport);
      expect(envelope.objects).toHaveLength(6);
      const { restoredBytes, staged } = await stageBookendArchive(reader, envelope);
      const tables = installDatabase(base);
      const result = await mediaLibraryRootPublisher.publish({
        envelope,
        journal,
        session: session('duplicate'),
        staged,
      });
      expect(result.imported).toBe(true);
      const restoredWorkspace = logicalReviewValues(tables).find(
        (value) => value.aggregateId !== base.entry.id
      );
      if (!restoredWorkspace) throw new Error('Missing restored review');
      const baseline = reviewAdvancedContentBaseline(restoredWorkspace.advanced);
      for (const cursor of [0, 1, 0, 1]) {
        const document = replayReviewHistory(
          restoredWorkspace.history,
          cursor,
          restoredWorkspace.source,
          baseline
        );
        expect(document.advancedContent.windowHeader?.title).toBe(
          cursor ? 'data: after' : 'Qk before'
        );
        const image = document.advancedContent.windowHeader?.faviconDataUrl;
        expect(image).toBe(favicon);
        expect(atob(image!.slice(image!.indexOf(',') + 1))).toBe(
          atob(favicon.slice(favicon.indexOf(',') + 1))
        );
      }
      expect(result.retainedAssetIds.every((id) => !id.startsWith('transport-'))).toBe(true);
      for (const id of ['opening', 'ending']) {
        const matches = await Promise.all(
          [...restoredBytes].map(async ([key, file]) =>
            (await file.text()) === `intact-${id}-bytes` ? key : null
          )
        );
        const restoredAssetId = matches.find((key) => key !== null);
        const entry = [...tables.get('project_assets')!.values()].find(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'assetId' in value &&
            value.assetId === restoredAssetId
        );
        expect(entry).toBeDefined();
        if (!entry || typeof entry !== 'object' || !('id' in entry) || !('assetId' in entry))
          throw new Error('Missing restored scene asset');
        expect(await restoredBytes.get(String(entry.assetId))!.text()).toBe(`intact-${id}-bytes`);
        const reference = `project-asset:${entry.id}`;
        expect(reference).not.toBe(`project-asset:${id}`);
        expect(tables.get('media_library')!.has(reference)).toBe(false);
        const restored = logicalReviewValues(tables).find((value) =>
          JSON.stringify(value).includes(reference)
        );
        expect(restored).toBeDefined();
        if (kind === 'original-speech') {
          expect(restored).toHaveProperty(
            id === 'ending'
              ? 'advanced.audio.originalSpeech.transcript.replacements.0.assetId'
              : 'history.0.before.audio.originalSpeech.transcript.replacements.1.assetId',
            reference
          );
          expect(restored).toHaveProperty('advanced.audio.originalSpeech.enabled', false);
          expect(restored).toHaveProperty(
            'advanced.audio.originalSpeech.transcript.replacements.0.originalVolume',
            0.25
          );
        } else if (id === 'ending')
          expect(restored).toHaveProperty('advanced.presentation.outro.image.assetId', reference);
        else
          expect(restored).toHaveProperty(
            'history.0.before.presentation.intro.image.assetId',
            reference
          );
      }
    } finally {
      await reader.close();
    }
  }
);

it.each(['source-hash', 'resource-hash', 'mime', 'signature', 'unsafe-svg', 'valid'] as const)(
  'checks retained redo annotation integrity before standalone Replace: %s',
  async (mode) => {
    const { sha256EffectV1Bytes } = await import('@sniptale/runtime-contracts/effect-v1');
    const { encodePortableReviewAssetRefs } =
      await import('../../../../composition/persistence/review-workspaces/asset-refs');
    const { readAssetFile } = await import('../../../../composition/persistence/assets');
    const fixture = await annotationReviewFixture();
    let blob = fixture.blob;
    if (mode === 'source-hash')
      fixture.snapshot.source = fixture.snapshot.source.replace(
        'Neutral runtime conformance',
        'Mutated runtime conformance'
      );
    if (mode === 'resource-hash')
      blob = new Blob([(await blob.text()).replace('width="1"', 'width="2"')], { type: blob.type });
    if (mode === 'mime') blob = new Blob([await blob.arrayBuffer()], { type: 'image/png' });
    if (mode === 'signature' || mode === 'unsafe-svg') {
      blob = new Blob(
        [
          mode === 'signature'
            ? 'x'.repeat(blob.size)
            : '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ],
        { type: blob.type }
      );
      const hash = await sha256EffectV1Bytes(new Uint8Array(await blob.arrayBuffer()));
      const { readReviewAnnotationEffectDocument } =
        await import('../../../../features/video/review/annotation-effects/validation');
      const document = readReviewAnnotationEffectDocument(fixture.snapshot.source);
      if (!document || !document.assets[0] || !fixture.snapshot.assets[0])
        throw new Error('Invalid fixture');
      fixture.snapshot.assets[0] = {
        ...fixture.snapshot.assets[0],
        byteLength: blob.size,
        sha256: hash,
      };
      fixture.snapshot.source = JSON.stringify({
        ...document,
        assets: [{ ...document.assets[0], byteLength: blob.size, sha256: hash }],
      });
      fixture.snapshot.sha256 = await sha256EffectV1Bytes(
        new TextEncoder().encode(fixture.snapshot.source)
      );
      const oldId = fixture.snapshot.id;
      fixture.snapshot.id = `effect:${fixture.snapshot.sha256}`;
      for (const operation of fixture.review.workspace.history) {
        if (operation.target === 'advancedContent')
          for (const instance of operation.after.annotationEffects?.instances ?? [])
            if (instance.snapshotId === oldId) instance.snapshotId = fixture.snapshot.id;
      }
      fixture.snapshot.retainedByteLength =
        new TextEncoder().encode(fixture.snapshot.source).byteLength + blob.size;
    }
    const base = portableMetadata(true);
    const metadata = {
      ...base,
      videoReview: encodePortableReviewAssetRefs(fixture.review),
      reviewAssets: [
        {
          entry: { id: 'mark', createdAt: 1, mimeType: 'image/svg+xml', size: blob.size },
          filename: 'mark.svg',
          objectId: 'mark-object',
          publishToLibrary: false,
        },
      ],
    };
    const tables = installDatabase(metadata);
    const previous = structuredClone(tables);
    vi.mocked(readAssetFile).mockImplementation(async (reference) => {
      if (reference.assetId !== 'mark-bytes') throw new Error('Unexpected staged read');
      return new File([blob], 'mark.svg', { type: blob.type });
    });
    const pending = mediaLibraryRootPublisher.publish({
      envelope: {
        descriptor: {
          mediaSubtype: 'library-item',
          metadataPath: '_sniptale/metadata/media/export-e.json',
          objectCount: 2,
          rootId: metadata.entry.id,
          rootKind: 'media',
          totalBytes: 6 + blob.size,
        },
        metadata: portableJson(metadata),
        objects: [],
      },
      journal,
      session: session('replace'),
      staged: [
        stagedObjects()[0]!,
        {
          objectId: 'mark-object',
          ref: {
            assetId: 'mark-bytes',
            createdAt: 1,
            location: { kind: 'opfs', objectKey: 'objects/mark-bytes' },
            mimeType: blob.type,
            size: blob.size,
            sha256: null,
          },
        },
      ],
    });
    if (mode !== 'valid') {
      await expect(pending).rejects.toMatchObject({
        code: mode === 'source-hash' ? 'source-integrity' : 'resource-integrity',
      });
      expect(tables).toEqual(previous);
      expect(mocks.checkpoint).not.toHaveBeenCalled();
    } else {
      await expect(pending).resolves.toMatchObject({ imported: true });
      const restored = logicalReviewValues(tables)[0];
      expect(restored?.cursor).toBe(0);
      expect(restored?.effectSnapshots?.[0]?.assets[0]?.assetId).not.toBe('project-asset:mark');
      expect(restored?.history[0]?.target).toBe('advancedContent');
      expect(vi.mocked(readAssetFile)).toHaveBeenCalledOnce();
    }
  }
);
