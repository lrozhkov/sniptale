import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createMediaLibraryEntry,
  createProjectExportEntry,
} from '../../../composition/persistence/projects/index.storage.test-support';
import { betaV1Fixture } from '../../../composition/persistence/infrastructure/indexed-db/fixtures/beta-v1';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import type { VideoWorkspace } from '../../../composition/persistence/review-workspaces/contracts';
import type { MediaAssetSource } from '../../../composition/persistence/media-library/contracts';
import type { AudioJobStart, AudioJobServerMessage } from '../../../contracts/ai/audio';
import { readVideoWorkspace } from '../../../composition/persistence/review-workspaces/store';
import { authorizeAudioJob } from './authorization';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../../features/video/review/text-document';
import { createAudioJobService } from './service';
const harness = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../../../composition/persistence/infrastructure/indexed-db/core', async (original) => ({
  ...(await original<
    typeof import('../../../composition/persistence/infrastructure/indexed-db/core')
  >()),
  initDB: harness.database,
}));
vi.mock('../../../composition/persistence/review-workspaces/store', () => ({
  readVideoWorkspace: vi.fn(),
}));
const ref = {
  assetId: 'source',
  createdAt: 1,
  size: 15,
  mimeType: 'video/webm',
  sha256: null,
  location: { kind: 'opfs', objectKey: 'objects/source' },
};
let workspace: VideoWorkspace;
let rows: Map<string, Map<string, unknown>>;
let objects: Map<string, File>;
const request: AudioJobStart = {
  type: 'start',
  requestId: 'original',
  modelId: 'model',
  operation: 'transcription',
  scope: {
    workspaceId: 'media',
    workspaceRevision: 1,
    target: { kind: 'original' },
    assetId: 'source',
    nativeStart: 0,
    nativeEnd: 4,
  },
};
function setSource(source: MediaAssetSource) {
  rows.get('media_library')!.set(
    'media',
    createMediaLibraryEntry({
      id: 'media',
      kind:
        source.kind === 'recording'
          ? 'recording'
          : source.kind === 'project-export'
            ? 'export'
            : 'video',
      mimeType: ref.mimeType,
      size: ref.size,
      source,
    })
  );
}
beforeEach(() => {
  rows = new Map(
    ['media_library', 'project_assets', 'project_exports', 'recordings', 'asset_refs'].map(
      (name) => [name, new Map()]
    )
  );
  rows.get('asset_refs')!.set(ref.assetId, ref);
  rows.get('project_assets')!.set('scene', {
    id: 'scene',
    assetId: ref.assetId,
    createdAt: 1,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  rows.get('recordings')!.set('scene', {
    ...betaV1Fixture.records.recordings[0],
    id: 'scene',
    assetId: ref.assetId,
    size: ref.size,
    mimeType: ref.mimeType,
  });
  rows.get('project_exports')!.set(
    'scene',
    createProjectExportEntry({
      id: 'scene',
      projectId: 'project',
      assetId: ref.assetId,
      size: ref.size,
      mimeType: ref.mimeType,
    })
  );
  setSource({ kind: 'recording', recordingId: 'scene' });
  // Actual locator parsers and immutable binding run over a bounded storage adapter.
  harness.database.mockResolvedValue({
    transaction: () => ({
      objectStore: (name: string) => ({ get: async (id: string) => rows.get(name)!.get(id) }),
      done: Promise.resolve(),
    }),
  });
  objects = new Map([['source', new File([new Uint8Array(15)], 'source.webm')]]);
  const directory = {
    getDirectoryHandle: async () => directory,
    getFileHandle: async (id: string) => ({
      getFile: async () => {
        const file = objects.get(id);
        if (!file) throw new DOMException('missing', 'NotFoundError');
        return file;
      },
    }),
  };
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => directory } });
  workspace = {
    aggregateId: 'media',
    formatVersion: 1,
    revision: 1,
    sourceAssetId: 'source',
    source: { duration: 4, width: 10, height: 10, mimeType: ref.mimeType, size: 15 },
    advanced: createQuickEditAdvancedState(),
    history: [],
    cursor: 0,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.mocked(readVideoWorkspace).mockImplementation(async () => ({ workspace, draft: null }));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it.each<MediaAssetSource>([
  { kind: 'recording', recordingId: 'scene' },
  { kind: 'project-export', exportId: 'scene', projectId: 'project' },
  { kind: 'project-asset', projectAssetId: 'scene' },
])('admits exact immutable $kind source through real resolver and OPFS reader', async (source) => {
  setSource(source);
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
});
it.each([
  'aggregate',
  'asset',
  'size',
  'mime',
  'missing-ref',
  'missing-object',
  'short-object',
  'trash',
  'missing-media',
  'export-project',
  'locator',
] as const)('fails closed on %s with zero provider requests', async (change) => {
  if (change === 'aggregate') workspace.aggregateId = 'other';
  if (change === 'asset') workspace.sourceAssetId = 'other';
  if (change === 'size') workspace.source.size = 14;
  if (change === 'mime') workspace.source.mimeType = 'video/mp4';
  if (change === 'missing-ref') rows.get('asset_refs')!.clear();
  if (change === 'missing-object') objects.clear();
  if (change === 'short-object') objects.set('source', new File(['x'], 'short'));
  if (change === 'trash')
    rows.get('media_library')!.set('media', {
      ...createMediaLibraryEntry({
        id: 'media',
        kind: 'video',
        mimeType: ref.mimeType,
        size: 15,
        source: { kind: 'recording', recordingId: 'scene' },
      }),
      lifecycle: { trashedAt: 2, revision: 1 },
    });
  if (change === 'missing-media') rows.get('media_library')!.clear();
  if (change === 'export-project')
    setSource({ kind: 'project-export', exportId: 'scene', projectId: 'forged' });
  if (change === 'locator') setSource({ kind: 'recording', recordingId: 'unrelated' });
  const post = vi.fn();
  const messages: AudioJobServerMessage[] = [];
  const service = createAudioJobService({ authorize: authorizeAudioJob, request: post });
  const connection = service.connect((message) => messages.push(message));
  connection.receive(request);
  await vi.waitFor(() =>
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: 'original',
      code: 'unauthorized',
    })
  );
  expect(post).not.toHaveBeenCalled();
  await connection.disconnect();
});

it('admits complete muted original through Speed and Cut while retaining source bounds', async () => {
  workspace.advanced.audio.original.muted = true;
  workspace.advanced.audio.original.volume = 0;
  workspace.history = [
    {
      id: 'speed-op',
      at: 1,
      target: 'edit',
      before: null,
      after: {
        id: 'speed',
        kind: 'speed',
        start: 1,
        end: 2,
        requestedStart: 1,
        requestedEnd: 2,
        rate: 2,
        audio: 'mute',
      },
    },
  ];
  workspace.cursor = 1;
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  workspace.history = [
    {
      id: 'cut-op',
      at: 1,
      target: 'edit',
      before: null,
      after: { id: 'cut', kind: 'cut', start: 1, end: 2, requestedStart: 1, requestedEnd: 2 },
    },
  ];
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  await expect(
    authorizeAudioJob({ ...request, scope: { ...request.scope, nativeStart: 1, nativeEnd: 2 } })
  ).resolves.toBeUndefined();
  await expect(
    authorizeAudioJob({
      ...request,
      scope: { ...request.scope, nativeEnd: workspace.source.duration + 1 },
    })
  ).rejects.toThrow('unauthorized');
  await expect(
    authorizeAudioJob({ ...request, scope: { ...request.scope, nativeStart: 2, nativeEnd: 4 } })
  ).resolves.toBeUndefined();
});
it('original synthesis binds saved phrase text, revision and exact native bounds', async () => {
  workspace.advanced.audio.originalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      replacements: [],
      phrases: [
        {
          id: 'phrase',
          start: 0,
          end: 4,
          originalText: 'hello',
          text: 'hello',
          revision: 1,
          alignment: 'range',
        },
      ],
    },
  };
  const speech: AudioJobStart = {
    ...request,
    operation: 'speech',
    phraseId: 'phrase',
    textRevision: 1,
    text: 'hello',
    profile: { voiceId: 'voice', responseFormat: 'mp3' },
  };
  await expect(authorizeAudioJob(speech)).resolves.toBeUndefined();
  for (const change of [
    { phraseId: 'other' },
    { text: 'changed' },
    { textRevision: 2 },
    { scope: { ...request.scope, nativeEnd: 3 } },
  ])
    await expect(authorizeAudioJob({ ...speech, ...change })).rejects.toThrow('stale');
  delete workspace.advanced.audio.originalSpeech;
  await expect(authorizeAudioJob(speech)).rejects.toThrow('stale');
});
it('rechecks original source after authorization and discards stale response before staging', async () => {
  workspace.advanced.audio.originalSpeech = {
    enabled: true,
    transcript: {
      version: 1,
      replacements: [],
      phrases: [
        {
          id: 'phrase',
          start: 0,
          end: 4,
          originalText: 'hello',
          text: 'hello',
          revision: 1,
          alignment: 'range',
        },
      ],
    },
  };
  const speech: AudioJobStart = {
    ...request,
    operation: 'speech',
    phraseId: 'phrase',
    textRevision: 1,
    text: 'hello',
    profile: { voiceId: 'voice', responseFormat: 'mp3' },
  };
  const write = vi.fn();
  const post = vi.fn(async () => {
    rows.get('media_library')!.clear();
    return { kind: 'audio' as const, blob: new Blob(['audio'], { type: 'audio/mpeg' }) };
  });
  const messages: AudioJobServerMessage[] = [];
  const service = createAudioJobService({
    authorize: authorizeAudioJob,
    request: post,
    write,
    resolveModel: async () => ({
      url: 'https://example.test/audio/speech',
      apiKey: 'fixture',
      modelCode: 'm',
      speech: speech.profile,
    }),
  });
  const connection = service.connect((message) => messages.push(message));
  connection.receive(speech);
  await vi.waitFor(() =>
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: 'original',
      code: 'unauthorized',
    })
  );
  expect(post).toHaveBeenCalledOnce();
  expect(write).not.toHaveBeenCalled();
  expect(messages.some((m) => m.type === 'audio')).toBe(false);
  await connection.disconnect();
});

it('a replaced Library source after ticket issuance cannot send the staged input', async () => {
  const post = vi.fn();
  const read = vi.fn();
  const discard = vi.fn();
  const messages: AudioJobServerMessage[] = [];
  const ticket = '12345678-1234-4234-8234-123456789abc';
  const service = createAudioJobService({
    authorize: authorizeAudioJob,
    request: post,
    read,
    discard,
    createId: () => ticket,
    resolveModel: async () => ({
      url: 'https://example.test/audio/transcriptions',
      apiKey: 'fixture',
      modelCode: 'm',
      transcription: { responseFormat: 'json', timestampGranularity: 'none' },
    }),
  });
  const connection = service.connect((message) => messages.push(message));
  connection.receive(request);
  await vi.waitFor(() => expect(messages.some((m) => m.type === 'authorized')).toBe(true));
  setSource({ kind: 'recording', recordingId: 'changed' });
  connection.receive({
    type: 'execute',
    requestId: 'original',
    ticket,
    staged: { id: ticket, mimeType: 'audio/wav', size: 32044 },
  });
  await vi.waitFor(() =>
    expect(messages).toContainEqual({
      type: 'failure',
      requestId: 'original',
      code: 'unauthorized',
    })
  );
  expect(read).not.toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
  await connection.disconnect();
});

it('accepts detected codec parameters while preserving immutable container identity', async () => {
  workspace.source.mimeType = 'video/webm; codecs="vp8, opus"';
  await expect(authorizeAudioJob(request)).resolves.toBeUndefined();
  workspace.source.mimeType = 'video/mp4; codecs="avc1.42001f"';
  await expect(authorizeAudioJob(request)).rejects.toThrow('unauthorized');
});

it('uses authored text authority without resolving source bytes, while source jobs still require them', async () => {
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'script',
    text: 'Narration for a silent video',
    start: 0,
    end: 4,
  });
  if (!added.ok) throw new Error('fixture');
  workspace.advanced.text = added.document;
  const fragment = added.document.fragments[0]!;
  const speech: AudioJobStart = {
    ...request,
    operation: 'speech',
    phraseId: fragment.id,
    textRevision: fragment.revision,
    text: fragment.text,
    profile: { voiceId: 'voice', responseFormat: 'mp3' },
    scope: {
      workspaceId: workspace.aggregateId,
      workspaceRevision: workspace.revision,
      target: { kind: 'text', fragmentId: fragment.id },
      textRevision: fragment.revision,
      timingRevision: fragment.timingRevision,
      start: fragment.start,
      end: fragment.end,
      timeDomain: fragment.timeDomain,
    },
  };
  objects.clear();
  await expect(authorizeAudioJob(speech)).resolves.toBeUndefined();
  await expect(authorizeAudioJob(request)).rejects.toThrow('unauthorized');
  fragment.text = 'Changed after selection';
  await expect(authorizeAudioJob(speech)).rejects.toThrow('stale');
});

it.each<MediaAssetSource>([
  { kind: 'recording', recordingId: 'scene' },
  { kind: 'project-export', exportId: 'scene', projectId: 'project' },
  { kind: 'project-asset', projectAssetId: 'scene' },
])('admits archived quick-project audio through its exact $kind source binding', async (source) => {
  setSource(source);
  workspace.aggregateId = 'recording:quick-project:previous';
  workspace.sourceMediaId = 'media';
  await expect(
    authorizeAudioJob({
      ...request,
      scope: {
        ...request.scope,
        workspaceId: workspace.aggregateId,
      },
    })
  ).resolves.toBeUndefined();
  // The source media card cannot impersonate its independent archived workspace.
  await expect(authorizeAudioJob(request)).rejects.toThrow('unauthorized');
});

it.each(['missing', 'other-bytes', 'other-workspace'] as const)(
  'refuses an archived original with %s without calling the provider',
  async (failure) => {
    workspace.aggregateId = 'recording:quick-project:previous';
    workspace.sourceMediaId = 'media';
    const archivedRequest = {
      ...request,
      scope: { ...request.scope, workspaceId: workspace.aggregateId },
    };
    if (failure === 'missing') workspace.sourceMediaId = 'unrelated-source';
    if (failure === 'other-bytes') workspace.sourceAssetId = 'replacement-object';
    if (failure === 'other-workspace') archivedRequest.scope.workspaceId = 'another-project';
    const post = vi.fn();
    const messages: AudioJobServerMessage[] = [];
    const service = createAudioJobService({ authorize: authorizeAudioJob, request: post });
    const connection = service.connect((message) => messages.push(message));
    connection.receive(archivedRequest);
    await vi.waitFor(() =>
      expect(messages).toContainEqual({
        type: 'failure',
        requestId: 'original',
        code: 'unauthorized',
      })
    );
    expect(post).not.toHaveBeenCalled();
    await connection.disconnect();
  }
);
