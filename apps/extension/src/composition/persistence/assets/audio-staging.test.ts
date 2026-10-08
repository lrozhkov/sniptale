import { createMediaLibraryEntry } from '../projects/index.storage.test-support';
const stagingSource = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: stagingSource.database,
}));
import { afterEach, expect, it, vi } from 'vitest';
import { writeAudioStaging, readAudioStaging, discardAudioStaging } from './audio-staging';
import { readVideoWorkspace } from '../review-workspaces/store';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
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
  };
}
const stagingId = '12345678-1234-4234-8234-123456789abc';
const audioBlob = () => new Blob(['audio'], { type: 'audio/wav' });

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
