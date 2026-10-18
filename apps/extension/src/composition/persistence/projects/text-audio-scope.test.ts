import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectEntry } from './index.test-support';
import type { VideoProjectEntry } from './contracts';
import { createVideoProjectTextAudioScope } from '../../../features/video/project/text/voice-scope';
import { readVideoProjectTextAudioTarget } from './text-audio-scope';
import { parseVideoProjectEntryResult } from './read-guards';

const database = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), directory: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => ({ get: database.get, put: database.put }),
}));

let current: VideoProjectEntry | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { storage: { getDirectory: database.directory } });
  current = createVideoProjectEntry(
    {
      version: 5,
      textDocuments: [
        {
          id: 'document',
          binding: { kind: 'project' },
          document: {
            version: 1,
            fragments: [
              {
                id: 'phrase',
                text: 'Saved narration without source audio.',
                originalText: '',
                revision: 1,
                timingRevision: 2,
                start: 1,
                end: 3,
                timeDomain: 'result',
                alignment: 'manual',
                showInVideo: true,
              },
            ],
          },
        },
      ],
    },
    { workspaceRevision: 2 }
  );
  database.get.mockImplementation(async () => structuredClone(current));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function scope() {
  if (!current) throw new Error('Missing project fixture');
  return (await createVideoProjectTextAudioScope(current.project, 2, 'document', 'phrase')).scope;
}

it('admits the real canonical text-only project without source bytes, repair or publication', async () => {
  const selected = await scope();
  const before = structuredClone(current);
  const basis = await readVideoProjectTextAudioTarget(selected);
  expect(basis.fragment.text).toBe('Saved narration without source audio.');
  expect(basis.projection.ranges).toEqual([{ start: 1, end: 3 }]);
  expect(current).toEqual(before);
  expect(database.put).not.toHaveBeenCalled();
  expect(database.directory).not.toHaveBeenCalled();
  expect(database.get.mock.calls.every(([store]) => store === 'video_projects')).toBe(true);
});

it.each(['missing', 'trash', 'revision', 'timestamp', 'text', 'timing', 'recreated', 'document'])(
  'refuses %s canonical state, including restored changes with the same numeric tuple',
  async (change) => {
    const selected = await scope();
    if (!current) throw new Error('Missing project fixture');
    const fragment = current.project.textDocuments![0]!.document.fragments[0]!;
    switch (change) {
      case 'missing':
        current = undefined;
        break;
      case 'trash':
        current.lifecycle = {
          storageClass: 'library',
          savedAt: 100,
          updatedAt: 101,
          trashedAt: 101,
        };
        break;
      case 'revision':
        current.workspaceRevision = 3;
        break;
      case 'timestamp':
        current.project.updatedAt += 1;
        break;
      case 'text':
        fragment.text = 'Restored different words with the same fragment revision.';
        break;
      case 'timing':
        fragment.end += 1;
        break;
      case 'recreated':
        current.project.createdAt -= 1;
        current.createdAt = current.project.createdAt;
        break;
      case 'document':
        current.project.textDocuments = [];
        break;
    }
    if (current) expect(parseVideoProjectEntryResult(current).status).toBe('ready');
    await expect(readVideoProjectTextAudioTarget(selected)).rejects.toThrow();
    expect(database.put).not.toHaveBeenCalled();
    expect(database.directory).not.toHaveBeenCalled();
  }
);

it('refuses same-tuple replacement during the asynchronous selected-basis digest', async () => {
  const selected = await scope();
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let release!: () => void;
  let entered!: () => void;
  const paused = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, bytes) => {
    entered();
    await gate;
    return digest(algorithm, bytes);
  });
  const reading = readVideoProjectTextAudioTarget(selected);
  await paused;
  if (!current) throw new Error('Missing project fixture');
  current.project.textDocuments![0]!.document.fragments[0]!.text = 'Restored during hashing';
  release();
  await expect(reading).rejects.toThrow('stale');
  expect(database.get).toHaveBeenCalledTimes(2);
  expect(database.put).not.toHaveBeenCalled();
});
