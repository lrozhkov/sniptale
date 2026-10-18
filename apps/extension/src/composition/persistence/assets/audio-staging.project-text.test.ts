import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMemoryAudioStaging } from './audio-staging.test-support';
import { writeAudioStaging, readAudioStaging, discardAudioStaging } from './audio-staging';
import { createVideoProjectEntryWithMediaClip } from '../projects/index.test-support';
import type { VideoProjectEntry } from '../projects/contracts';
import { createVideoProjectTextAudioScope } from '../../../features/video/project/text/voice-scope';
import { parseVideoProjectEntryResult } from '../projects/read-guards';

const database = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../infrastructure/indexed-db/core', async (original) => ({
  ...(await original<typeof import('../infrastructure/indexed-db/core')>()),
  initDB: async () => ({ get: database.get }),
}));

const firstId = '12345678-1234-4234-8234-123456789abc';
const secondId = '12345678-1234-4234-8234-123456789abd';
let current: VideoProjectEntry | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  current = createVideoProjectEntryWithMediaClip({ version: 5, duration: 20 });
  current.workspaceRevision = 2;
  const project = current.project;
  project.textDocuments = [
    {
      id: 'document',
      binding: {
        kind: 'source',
        assetId: project.assets[0]!.id,
        sourceInstanceId: project.clips[0]!.id,
      },
      document: {
        version: 1,
        fragments: [
          {
            id: 'phrase',
            text: 'Selected authored speech',
            originalText: '',
            revision: 0,
            timingRevision: 0,
            start: 1,
            end: 3,
            timeDomain: 'source',
            alignment: 'manual',
            showInVideo: true,
          },
        ],
      },
    },
  ];
  database.get.mockImplementation(async () => structuredClone(current));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function selectedScope() {
  if (!current) throw new Error('Missing canonical fixture');
  return (await createVideoProjectTextAudioScope(current.project, 2, 'document', 'phrase')).scope;
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pausedAudio() {
  const entered = deferred();
  const gate = deferred();
  class PausedAudio extends Blob {
    override stream() {
      return new ReadableStream<Uint8Array<ArrayBuffer>>({
        async start(controller) {
          entered.resolve();
          await gate.promise;
          controller.enqueue(new Uint8Array([1, 2, 3, 4]));
          controller.close();
        },
      });
    }
  }
  return {
    entered: entered.promise,
    release: gate.resolve,
    blob: new PausedAudio(['wave'], { type: 'audio/wav' }),
  };
}

function changeCanonical(change: string) {
  if (!current) throw new Error('Missing canonical fixture');
  const document = current.project.textDocuments![0]!;
  switch (change) {
    case 'missing':
      current = undefined;
      break;
    case 'text':
      document.document.fragments[0]!.text = 'Restored changed text with the same revision';
      break;
    case 'binding':
      if (document.binding.kind !== 'source') throw new Error('Expected source binding');
      document.binding.sourceInstanceId = 'restored-instance';
      break;
    case 'placement':
      current.project.clips[0]!.startTime += 1;
      break;
    case 'recreated':
      current.project.createdAt -= 1;
      current.createdAt = current.project.createdAt;
      break;
  }
  if (current) expect(parseVideoProjectEntryResult(current).status).toBe('ready');
}

it('keeps independent project-text tickets separate while another upload is pending', async () => {
  const memory = createMemoryAudioStaging();
  const scope = await selectedScope();
  const paused = pausedAudio();
  const first = writeAudioStaging({ id: firstId, scope, blob: paused.blob });
  await paused.entered;
  const second = await writeAudioStaging({
    id: secondId,
    scope,
    blob: new Blob(['second'], { type: 'audio/wav' }),
  });
  expect(memory.files.get(firstId)?.size).toBe(0);
  expect(await (await readAudioStaging(second, scope)).text()).toBe('second');
  paused.release();
  const completed = await first;
  expect((await readAudioStaging(completed, scope)).size).toBe(4);
  await expect(writeAudioStaging({ id: firstId, scope, blob: paused.blob })).rejects.toThrow(
    'already exists'
  );
  expect((await readAudioStaging(completed, scope)).size).toBe(4);
});

it.each(['missing', 'text', 'binding', 'placement', 'recreated'])(
  'refuses delayed upload after %s and preserves a previously completed ticket',
  async (change) => {
    const memory = createMemoryAudioStaging();
    const scope = await selectedScope();
    const retained = await writeAudioStaging({
      id: secondId,
      scope,
      blob: new Blob(['retained'], { type: 'audio/wav' }),
    });
    const retainedBytes = memory.files.get(secondId);
    const paused = pausedAudio();
    const uploading = writeAudioStaging({ id: firstId, scope, blob: paused.blob });
    const refused = expect(uploading).rejects.toThrow('stale');
    await paused.entered;
    changeCanonical(change);
    paused.release();
    await refused;
    expect([...memory.files.keys()].sort()).toEqual([secondId, `${secondId}.json`].sort());
    expect(memory.files.get(secondId)).toBe(retainedBytes);
    await expect(readAudioStaging(retained, scope)).rejects.toThrow();
    await expect(discardAudioStaging(retained, { ...scope, projectRevision: 3 })).rejects.toThrow(
      'scope mismatch'
    );
    await discardAudioStaging(retained, scope);
    expect(memory.files.size).toBe(0);
  }
);

it('refuses deletion during initial admission before creating a directory', async () => {
  const memory = createMemoryAudioStaging();
  const scope = await selectedScope();
  const original = crypto.subtle.digest.bind(crypto.subtle);
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (algorithm, bytes) => {
    entered.resolve();
    await gate.promise;
    return original(algorithm, bytes);
  });
  const writing = writeAudioStaging({
    id: firstId,
    scope,
    blob: new Blob(['audio'], { type: 'audio/wav' }),
  });
  const refused = expect(writing).rejects.toThrow('stale');
  await entered.promise;
  current = undefined;
  gate.resolve();
  await refused;
  expect(memory.getDirectory).not.toHaveBeenCalled();
});

it('refuses old staged audio after restored native slice order changes within identical project ranges', async () => {
  const memory = createMemoryAudioStaging();
  if (!current) throw new Error('Missing canonical fixture');
  const project = current.project;
  const clip = project.clips[0];
  const binding = project.textDocuments![0]!.binding;
  if (!clip || clip.type !== 'VIDEO' || binding.kind !== 'source')
    throw new Error('Expected source-bound video');
  project.clips = [
    {
      ...clip,
      sourceInstanceId: binding.sourceInstanceId,
      sourceStart: 1,
      sourceDuration: 1,
      duration: 1,
      startTime: 0,
    },
    {
      ...clip,
      id: 'second-part',
      sourceInstanceId: binding.sourceInstanceId,
      sourceStart: 2,
      sourceDuration: 1,
      duration: 1,
      startTime: 1,
    },
  ];
  const scope = await selectedScope();
  const handle = await writeAudioStaging({
    id: firstId,
    scope,
    blob: new Blob(['audio'], { type: 'audio/wav' }),
  });
  const first = project.clips[0];
  const second = project.clips[1];
  if (first?.type !== 'VIDEO' || second?.type !== 'VIDEO') throw new Error('Expected split video');
  first.sourceStart = 2;
  second.sourceStart = 1;
  expect(parseVideoProjectEntryResult(current).status).toBe('ready');
  await expect(readAudioStaging(handle, scope)).rejects.toThrow('stale');
  await discardAudioStaging(handle, scope);
  expect(memory.files.size).toBe(0);
});

it('rechecks canonical text after an asynchronous temporary-byte read', async () => {
  const memory = createMemoryAudioStaging();
  const scope = await selectedScope();
  const handle = await writeAudioStaging({
    id: firstId,
    scope,
    blob: new Blob(['audio'], { type: 'audio/wav' }),
  });
  const root = await memory.getDirectory();
  const getFileHandle = root.getFileHandle.bind(root);
  const entered = deferred();
  const gate = deferred();
  vi.spyOn(root, 'getFileHandle').mockImplementation(async (name, options) => {
    const file = await getFileHandle(name, options);
    return name !== firstId
      ? file
      : {
          ...file,
          async getFile() {
            entered.resolve();
            await gate.promise;
            return file.getFile();
          },
        };
  });
  const reading = readAudioStaging(handle, scope);
  const refused = expect(reading).rejects.toThrow('stale');
  await entered.promise;
  changeCanonical('text');
  gate.resolve();
  await refused;
  await discardAudioStaging(handle, scope);
  expect(memory.files.size).toBe(0);
});
