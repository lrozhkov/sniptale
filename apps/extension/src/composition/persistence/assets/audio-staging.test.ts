import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
const stagingSource = vi.hoisted(() => ({ database: vi.fn() }));
const projectSource = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('../projects/index', async (original) => ({
  ...(await original<typeof import('../projects/index')>()),
  getVideoProject: projectSource.read,
}));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: stagingSource.database,
}));
import { afterEach, expect, it, vi } from 'vitest';
import { writeAudioStaging, readAudioStaging, discardAudioStaging } from './audio-staging';
import { readVideoWorkspace } from '../review-workspaces/store';
import {
  createEmptyVideoProject,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { createVideoClipFromAsset } from '../../../features/video/project/factories/clip';
import { createVideoProjectAudioScope } from '../../../features/video/project/text/audio-scope';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import {
  addReviewTextFragment,
  createReviewTextDocument,
} from '../../../features/video/review/text-document';
vi.mock('../review-workspaces/store', () => ({ readVideoWorkspace: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
const scope = {
  workspaceId: 'w',
  workspaceRevision: 1,
  target: { kind: 'voiceover' as const, clipId: 'clip' },
  assetId: 'project-asset:a',
  nativeStart: 0,
  nativeEnd: 1,
};
it('a write admitted before erasure cannot recreate staging after the workspace disappears', async () => {
  const advanced = createQuickEditAdvancedState();
  advanced.audio.voiceover = [
    {
      id: 'clip',
      assetId: 'project-asset:a',
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  vi.mocked(readVideoWorkspace)
    .mockResolvedValueOnce({
      workspace: {
        aggregateId: 'w',
        formatVersion: 1,
        source: { duration: 1, width: 10, height: 10, mimeType: 'video/webm', size: 10 },
        sourceAssetId: 'source',
        revision: 1,
        history: [],
        cursor: 0,
        advanced,
        createdAt: 1,
        updatedAt: 1,
      },
      draft: null,
    })
    .mockResolvedValueOnce(null);
  const getDirectory = vi.fn();
  vi.stubGlobal('navigator', { storage: { getDirectory } });
  await expect(
    writeAudioStaging({
      id: '12345678-1234-4234-8234-123456789abc',
      scope,
      blob: new Blob(['bytes'], { type: 'audio/wav' }),
    })
  ).rejects.toThrow('Stale audio staging scope');
  expect(getDirectory).not.toHaveBeenCalled();
  expect(readVideoWorkspace).toHaveBeenCalledTimes(2);
});
it('rejects path traversal and oversized input before touching OPFS', async () => {
  await expect(
    writeAudioStaging({ id: '../escape', scope, blob: new Blob(['x'], { type: 'audio/wav' }) })
  ).rejects.toThrow('Invalid audio staging identity');
});

function memoryStaging() {
  const files = new Map<string, Blob>();
  const busy = new Set<string>();
  let failWrite = false;
  const root = {
    async getDirectoryHandle(): Promise<unknown> {
      return root;
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      if (!files.has(name)) {
        if (!options?.create) throw new DOMException('missing', 'NotFoundError');
        files.set(name, new Blob());
      }
      return {
        kind: 'file',
        async getFile() {
          return new File([files.get(name)!], name);
        },
        async createWritable() {
          const chunks: BlobPart[] = [];
          return {
            async write(value: BlobPart) {
              if (failWrite && !name.endsWith('.json')) throw new Error('disk full');
              chunks.push(value);
            },
            async close() {
              files.set(name, new Blob(chunks));
            },
            async abort() {
              chunks.length = 0;
            },
          };
        },
      };
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException('missing', 'NotFoundError');
    },
    async *entries() {
      for (const name of [...files.keys()]) yield [name, { kind: 'file' }];
    },
  };
  const getDirectory = vi.fn(async () => root);
  vi.stubGlobal('navigator', {
    storage: { getDirectory },
    locks: {
      async request(name: string, options: unknown, callback?: (lock: unknown) => unknown) {
        if (typeof options === 'function') return options({ name });
        return callback?.(busy.has(name) ? null : { name });
      },
    },
  });
  const advanced = createQuickEditAdvancedState();
  advanced.audio.voiceover = [
    {
      id: 'clip',
      assetId: scope.assetId,
      timelineStart: 0,
      sourceOffset: 0,
      duration: 1,
      volume: 1,
      muted: false,
      fadeIn: 0,
      fadeOut: 0,
    },
  ];
  vi.mocked(readVideoWorkspace).mockResolvedValue({
    workspace: {
      aggregateId: 'w',
      formatVersion: 1,
      source: { duration: 1, width: 10, height: 10, mimeType: 'video/webm', size: 10 },
      sourceAssetId: 'source',
      revision: 1,
      history: [],
      cursor: 0,
      advanced,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  return {
    files,
    busy,
    getDirectory,
    failWrites: () => {
      failWrite = true;
    },
    allowWrites: () => {
      failWrite = false;
    },
  };
}
const stagingId = '12345678-1234-4234-8234-123456789abc';
const audioBlob = () => new Blob(['audio'], { type: 'audio/wav' });

it('stages asset-free narration and refuses changed placement before physical writes', async () => {
  const memory = memoryStaging();
  const advanced = createQuickEditAdvancedState();
  const added = addReviewTextFragment(createReviewTextDocument(), {
    id: 'text',
    start: 0,
    end: 1,
    text: 'Hello',
  });
  if (!added.ok) throw new Error('fixture');
  advanced.text = added.document;
  const fragment = added.document.fragments[0]!;
  const textScope = {
    workspaceId: 'w',
    workspaceRevision: 1,
    target: { kind: 'text' as const, fragmentId: fragment.id },
    textRevision: fragment.revision,
    timingRevision: fragment.timingRevision,
    start: fragment.start,
    end: fragment.end,
    timeDomain: fragment.timeDomain,
  };
  vi.mocked(readVideoWorkspace).mockResolvedValue({
    workspace: {
      aggregateId: 'w',
      formatVersion: 1,
      revision: 1,
      sourceAssetId: 'unused',
      source: { duration: 1, width: 10, height: 10, mimeType: 'video/webm', size: 10 },
      advanced,
      history: [],
      cursor: 0,
      createdAt: 1,
      updatedAt: 1,
    },
    draft: null,
  });
  const handle = await writeAudioStaging({ id: stagingId, scope: textScope, blob: audioBlob() });
  expect(await (await readAudioStaging(handle, textScope)).text()).toBe('audio');
  expect(memory.files.size).toBe(2);
  await discardAudioStaging(handle, textScope);
  memory.getDirectory.mockClear();
  fragment.timingRevision += 1;
  await expect(
    writeAudioStaging({ id: stagingId, scope: textScope, blob: audioBlob() })
  ).rejects.toThrow('Stale audio staging scope');
  expect(memory.getDirectory).not.toHaveBeenCalled();
  expect(memory.files.size).toBe(0);
});

it('roundtrips scoped bytes and refuses duplicate tickets without deleting the original', async () => {
  const memory = memoryStaging();
  const handle = await writeAudioStaging({ id: stagingId, scope, blob: audioBlob() });
  const file = await readAudioStaging(handle, scope);
  expect(await file.text()).toBe('audio');
  expect(file.type).toBe('audio/wav');
  await expect(writeAudioStaging({ id: stagingId, scope, blob: audioBlob() })).rejects.toThrow(
    'already exists'
  );
  expect(await (await readAudioStaging(handle, scope)).text()).toBe('audio');
  await expect(
    discardAudioStaging(handle, {
      ...scope,
      target: { kind: 'voiceover' as const, clipId: 'other' },
    })
  ).rejects.toThrow('scope mismatch');
  expect(memory.files.size).toBe(2);
  await discardAudioStaging(handle, scope);
  await discardAudioStaging(handle, scope);
  expect(memory.files.size).toBe(0);
});

it('cleans failed writes and refuses an aborted or no-longer-existing clip before OPFS', async () => {
  const memory = memoryStaging();
  memory.failWrites();
  await expect(writeAudioStaging({ id: stagingId, scope, blob: audioBlob() })).rejects.toThrow(
    'disk full'
  );
  expect(memory.files.size).toBe(0);
  const controller = new AbortController();
  controller.abort();
  await expect(
    writeAudioStaging({ id: stagingId, scope, blob: audioBlob(), signal: controller.signal })
  ).rejects.toThrow();
  await expect(
    writeAudioStaging({
      id: stagingId,
      scope: { ...scope, target: { kind: 'voiceover' as const, clipId: 'removed' } },
      blob: audioBlob(),
    })
  ).rejects.toThrow('Missing audio staging scope');
});

it.each([
  ['scope', { ...scope, nativeEnd: 2 }],
  ['expiresAt', 0],
  ['expiresAt', 'later'],
  ['mimeType', 'text/plain'],
  ['size', 0],
  ['size', 999999999],
  ['size', '5'],
])('rejects tampered %s metadata without exposing audio', async (field, value) => {
  const memory = memoryStaging();
  const handle = await writeAudioStaging({ id: stagingId, scope, blob: audioBlob() });
  const metadata: unknown = JSON.parse(await memory.files.get(`${stagingId}.json`)!.text());
  if (!metadata || typeof metadata !== 'object') throw new Error('Missing test metadata');
  Reflect.set(metadata, field, value);
  memory.files.set(`${stagingId}.json`, new Blob([JSON.stringify(metadata)]));
  await expect(readAudioStaging(handle, scope)).rejects.toThrow('Stale audio staging');
});

it.each(['null', '{', 'x'.repeat(4097)])(
  'refuses malformed metadata on read and discard',
  async (value) => {
    const memory = memoryStaging();
    const handle = await writeAudioStaging({ id: stagingId, scope, blob: audioBlob() });
    memory.files.set(`${stagingId}.json`, new Blob([value]));
    await expect(readAudioStaging(handle, scope)).rejects.toThrow();
    await expect(discardAudioStaging(handle, scope)).rejects.toThrow();
    expect(memory.files.has(stagingId)).toBe(true);
  }
);

it('rejects truncated payload and handle mismatches', async () => {
  const memory = memoryStaging();
  const handle = await writeAudioStaging({ id: stagingId, scope, blob: audioBlob() });
  await expect(readAudioStaging({ ...handle, size: 1 }, scope)).rejects.toThrow('Stale');
  await expect(readAudioStaging({ ...handle, mimeType: 'audio/mpeg' }, scope)).rejects.toThrow(
    'Stale'
  );
  memory.files.set(stagingId, new Blob(['x']));
  await expect(readAudioStaging(handle, scope)).rejects.toThrow('Incomplete');
});

it.each(['', '{', 'null', '{}', 'x'.repeat(4097), '{"expiresAt":0}'])(
  'recovers abandoned metadata and bytes on the next admitted write',
  async (metadata) => {
    const memory = memoryStaging();
    const oldId = '22345678-1234-4234-8234-123456789abc';
    memory.files.set(oldId, audioBlob());
    memory.files.set(`${oldId}.json`, new Blob([metadata]));
    memory.files.set('unrelated', audioBlob());
    await writeAudioStaging({ id: stagingId, scope, blob: audioBlob() });
    expect(memory.files.has(oldId)).toBe(false);
    expect(memory.files.has(`${oldId}.json`)).toBe(false);
    expect(memory.files.has('unrelated')).toBe(true);
  }
);

it('does not recover an expired ticket while another context owns its lock', async () => {
  const memory = memoryStaging();
  const oldId = '22345678-1234-4234-8234-123456789abc';
  memory.files.set(oldId, audioBlob());
  memory.files.set(`${oldId}.json`, new Blob(['{}']));
  memory.busy.add(`sniptale:audio-staging:${oldId}`);
  await writeAudioStaging({
    id: stagingId,
    scope,
    blob: new Blob(['mp3'], { type: 'audio/mpeg' }),
  });
  expect(memory.files.has(oldId)).toBe(true);
  expect(
    (await readAudioStaging({ id: stagingId, size: 3, mimeType: 'audio/mpeg' }, scope)).name
  ).toBe('audio.mp3');
});

it('rejects invalid audio and scope before storage and tolerates already-erased staging', async () => {
  const memory = memoryStaging();
  for (const blob of [new Blob(), new Blob(['x'], { type: 'text/plain' })]) {
    await expect(writeAudioStaging({ id: stagingId, scope, blob })).rejects.toThrow(
      'Invalid staged audio'
    );
  }
  await expect(
    discardAudioStaging(
      { id: stagingId, size: 5, mimeType: 'audio/wav' },
      { ...scope, nativeEnd: -1 }
    )
  ).rejects.toThrow('Invalid audio scope');
  memory.getDirectory.mockRejectedValueOnce(new DOMException('erased', 'NotFoundError'));
  await discardAudioStaging({ id: stagingId, size: 5, mimeType: 'audio/wav' }, scope);
  memory.getDirectory.mockRejectedValueOnce(new Error('storage failed'));
  await expect(
    discardAudioStaging({ id: stagingId, size: 5, mimeType: 'audio/wav' }, scope)
  ).rejects.toThrow('storage failed');
});

it('roundtrips original scopes without allowing a voiceover discriminator to read or discard them', async () => {
  const memory = memoryStaging();
  const snapshot = await readVideoWorkspace('w');
  if (!snapshot) throw new Error('Missing workspace fixture');
  snapshot.workspace.source.mimeType = 'video/webm; codecs="vp8, opus"';
  const original = { ...scope, target: { kind: 'original' as const }, assetId: 'source' };
  const rows = new Map<string, unknown>([
    [
      'media_library',
      createMediaLibraryEntry({
        id: 'w',
        kind: 'video',
        mimeType: 'video/webm',
        size: 10,
        source: { kind: 'stored-asset', assetId: 'source' },
      }),
    ],
    [
      'asset_refs',
      {
        assetId: 'source',
        size: 10,
        mimeType: 'video/webm',
        createdAt: 1,
        sha256: null,
        location: { kind: 'opfs', objectKey: 'objects/source' },
      },
    ],
  ]);
  stagingSource.database.mockResolvedValue({
    transaction: () => ({
      objectStore: (name: string) => ({ get: async () => rows.get(name) }),
      done: Promise.resolve(),
    }),
  });
  const handle = await writeAudioStaging({ id: stagingId, scope: original, blob: audioBlob() });
  expect(await (await readAudioStaging(handle, original)).text()).toBe('audio');
  await expect(readAudioStaging(handle, { ...original, target: scope.target })).rejects.toThrow(
    'Stale audio staging'
  );
  await expect(discardAudioStaging(handle, { ...original, target: scope.target })).rejects.toThrow(
    'scope mismatch'
  );
  await discardAudioStaging(handle, original);
  expect(memory.files.size).toBe(0);
  let reads = 0;
  stagingSource.database.mockImplementation(async () => {
    if (++reads === 2) rows.delete('media_library');
    return {
      transaction: () => ({
        objectStore: (name: string) => ({ get: async () => rows.get(name) }),
        done: Promise.resolve(),
      }),
    };
  });
  await expect(
    writeAudioStaging({ id: stagingId, scope: original, blob: audioBlob() })
  ).rejects.toThrow();
  expect(memory.files.size).toBe(0);
});

function projectStagingScope() {
  const project = createEmptyVideoProject('Project audio');
  const asset = createVideoProjectAsset(
    'Source',
    'VIDEO',
    { kind: 'project-asset', projectAssetId: 'source' },
    {
      width: 640,
      height: 360,
      duration: 10,
      hasAudio: true,
      mimeType: 'video/webm',
      size: 5,
      audioPeaks: null,
    }
  );
  const clip = createVideoClipFromAsset(project.tracks[0]!.id, asset, 640, 360, 0);
  project.assets = [asset];
  project.clips = [clip];
  const selected = createVideoProjectAudioScope(project, 3, clip.id, 0, 1);
  if (!selected) throw new Error('Missing scope');
  const saved = { status: 'ready', project, workspaceRevision: 3 };
  projectSource.read.mockResolvedValue(saved);
  return { selected, saved };
}

function pausedAudio() {
  let release!: () => void;
  let start!: () => void;
  const entered = new Promise<void>((resolve) => {
    start = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const bytes = new Uint8Array([1, 2, 3, 4]);
  class PausedAudio extends Blob {
    override stream() {
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
          start();
          await gate;
          controller.enqueue(bytes);
          controller.close();
        },
      });
    }
  }
  return { entered, release, blob: new PausedAudio([bytes], { type: 'audio/wav' }) };
}

it('writes independent project tickets concurrently without crossing scopes', async () => {
  const memory = memoryStaging();
  const { selected } = projectStagingScope();
  const paused = pausedAudio();
  const first = writeAudioStaging({ id: stagingId, scope: selected, blob: paused.blob });
  await paused.entered;
  const other = { ...selected, nativeStart: 1, nativeEnd: 2 };
  const second = await writeAudioStaging({
    id: '12345678-1234-4234-8234-123456789abd',
    scope: other,
    blob: audioBlob(),
  });
  expect(memory.files.get(stagingId)?.size).toBe(0);
  await expect((await readAudioStaging(second, other)).text()).resolves.toBe('audio');
  await expect(readAudioStaging(second, selected)).rejects.toThrow('Stale audio staging');
  paused.release();
  const completed = await first;
  expect(new Uint8Array(await (await readAudioStaging(completed, selected)).arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3, 4])
  );
  expect(readVideoWorkspace).not.toHaveBeenCalled();
});

it('refuses a delayed project write after deletion before physical staging', async () => {
  const memory = memoryStaging();
  const { selected, saved } = projectStagingScope();
  let release!: () => void;
  let start!: () => void;
  const entered = new Promise<void>((resolve) => {
    start = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  projectSource.read.mockImplementationOnce(async () => {
    start();
    await gate;
    return saved;
  });
  const pending = writeAudioStaging({ id: stagingId, scope: selected, blob: audioBlob() });
  const refusal = expect(pending).rejects.toThrow('stale');
  await entered;
  projectSource.read.mockResolvedValue({ status: 'notFound' });
  release();
  await refusal;
  expect(memory.getDirectory).not.toHaveBeenCalled();
  expect(memory.files.size).toBe(0);
});

it('removes incomplete project bytes when the target disappears during upload', async () => {
  const memory = memoryStaging();
  const { selected } = projectStagingScope();
  const paused = pausedAudio();
  const pending = writeAudioStaging({ id: stagingId, scope: selected, blob: paused.blob });
  const refusal = expect(pending).rejects.toThrow('stale');
  await paused.entered;
  projectSource.read.mockResolvedValue({ status: 'notFound' });
  paused.release();
  await refusal;
  expect(memory.files.size).toBe(0);
});

it('retries a failed project staging write only with an explicit current scope', async () => {
  const memory = memoryStaging();
  const { selected } = projectStagingScope();
  memory.failWrites();
  await expect(
    writeAudioStaging({ id: stagingId, scope: selected, blob: audioBlob() })
  ).rejects.toThrow('disk full');
  expect(memory.files.size).toBe(0);
  memory.allowWrites();
  await expect(
    writeAudioStaging({
      id: stagingId,
      scope: { ...selected, projectRevision: 2 },
      blob: audioBlob(),
    })
  ).rejects.toThrow('stale');
  const handle = await writeAudioStaging({
    id: '12345678-1234-4234-8234-123456789abd',
    scope: selected,
    blob: audioBlob(),
  });
  await expect((await readAudioStaging(handle, selected)).text()).resolves.toBe('audio');
});

it('discards a project ticket after deletion without admitting another scope', async () => {
  const memory = memoryStaging();
  const { selected } = projectStagingScope();
  const handle = await writeAudioStaging({ id: stagingId, scope: selected, blob: audioBlob() });
  projectSource.read.mockResolvedValue({ status: 'notFound' });
  await expect(readAudioStaging(handle, selected)).rejects.toThrow('stale');
  await expect(discardAudioStaging(handle, { ...selected, projectId: 'other' })).rejects.toThrow(
    'scope mismatch'
  );
  expect(memory.files.size).toBe(2);
  await discardAudioStaging(handle, selected);
  expect(memory.files.size).toBe(0);
});
