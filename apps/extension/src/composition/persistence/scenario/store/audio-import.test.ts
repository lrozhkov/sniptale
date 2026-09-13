import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createGuideProject,
  createGuideStep,
  createTourDocument,
  createTourImageSlide,
} from '../../../../features/scenario/project/public';
const io = vi.hoisted(() => ({
  commit: vi.fn(),
  write: vi.fn(),
  discard: vi.fn(),
  decode: vi.fn(),
  close: vi.fn(),
  event: vi.fn(),
}));
vi.mock('../aggregate-mutations', () => ({ commitScenarioAggregateMutation: io.commit }));
vi.mock('../../assets', async (original) => ({
  ...(await original<typeof import('../../assets')>()),
  assertAssetWriteAdmission: vi.fn(async () => undefined),
  writeBlobToAsset: io.write,
  discardPreparedAsset: io.discard,
}));
vi.mock('../../../../features/media-hub/events', () => ({
  publishMediaHubLibraryChanged: io.event,
}));
import { importScenarioNarration } from './audio-import';
function input() {
  const project = createGuideProject('Guide', 'guide', 100);
  project.items = [createGuideStep('Keep this', 'step')];
  project.tour = createTourDocument();
  project.tour.slides = [createTourImageSlide('first'), createTourImageSlide('second')];
  return {
    project,
    baseUpdatedAt: 100,
    slideId: 'first',
    expectedNarration: null,
    blob: new Blob(['voice'], { type: 'audio/webm' }),
    signal: new AbortController().signal,
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'AudioContext',
    class {
      decodeAudioData = io.decode;
      close = io.close;
    }
  );
  io.decode.mockResolvedValue({ duration: 4 });
  io.close.mockResolvedValue(undefined);
  io.commit.mockImplementation(async (project) => ({ project, workspaceRevision: 2 }));
  io.write.mockImplementation(async (blob: Blob) => ({
    ref: {
      assetId: 'physical-audio',
      createdAt: 200,
      location: { kind: 'opfs', objectKey: 'objects/audio' },
      mimeType: blob.type,
      sha256: null,
      size: blob.size,
    },
  }));
});
afterEach(() => vi.unstubAllGlobals());
it('publishes only the selected narration atomically and preserves authored source content', async () => {
  const args = input();
  const result = await importScenarioNarration(args);
  expect(result.items).toEqual(args.project.items);
  expect(result.tour!.slides[1]).toEqual(args.project.tour!.slides[1]);
  expect(args.project.tour!.slides[0]!.narration).toBeNull();
  expect(result.tour!.slides[0]!.narration).toMatchObject({
    duration: 4,
    trimStart: 0,
    trimEnd: 4,
    gain: 1,
    transcript: '',
  });
  const options = io.commit.mock.calls[0]![1];
  expect(options.expectedUpdatedAt).toBe(100);
  expect(options.children.assetPuts).toHaveLength(1);
  expect(options.children.assetPuts[0]).toMatchObject({ assetId: 'physical-audio', duration: 4 });
  expect(result.tour!.slides[0]!.narration!.assetId).toBe(options.children.assetPuts[0].id);
  expect(io.close).toHaveBeenCalledOnce();
  expect(io.discard).not.toHaveBeenCalled();
});
it('replaces a matching narration without mutating or deleting the old resource first', async () => {
  const args = input();
  const old = {
    assetId: 'old',
    duration: 3,
    trimStart: 1,
    trimEnd: 3,
    gain: 0.5,
    transcript: 'Text',
  };
  args.project.tour!.slides[0]!.narration = old;
  const result = await importScenarioNarration({ ...args, expectedNarration: old });
  expect(result.tour!.slides[0]!.narration!.assetId).not.toBe('old');
  expect(args.project.tour!.slides[0]!.narration).toEqual(old);
  expect(io.commit.mock.calls[0]![1].children.assetDeletes).toBeUndefined();
});
it.each(['missing', 'changed'])('rejects a %s target before decoding or staging', async (kind) => {
  const args = input();
  if (kind === 'missing') args.slideId = 'missing';
  else
    args.project.tour!.slides[0]!.narration = {
      assetId: 'changed',
      duration: 1,
      trimStart: 0,
      trimEnd: 1,
      gain: 1,
      transcript: '',
    };
  await expect(importScenarioNarration(args)).rejects.toThrow('target');
  expect(io.decode).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});
it.each(['empty', 'mime', 'oversize'])('rejects %s encoded input before decoding', async (kind) => {
  const args = input();
  if (kind === 'empty') args.blob = new Blob([], { type: 'audio/webm' });
  if (kind === 'mime') args.blob = new Blob(['image'], { type: 'image/png' });
  if (kind === 'oversize') Object.defineProperty(args.blob, 'size', { value: 257 * 1024 * 1024 });
  await expect(importScenarioNarration(args)).rejects.toThrow();
  expect(io.decode).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});
it.each([0, -1, Infinity, NaN, 3601])(
  'rejects decoded duration %s and closes the decoder',
  async (duration) => {
    io.decode.mockResolvedValue({ duration });
    await expect(importScenarioNarration(input())).rejects.toThrow('duration');
    expect(io.close).toHaveBeenCalledOnce();
    expect(io.write).not.toHaveBeenCalled();
  }
);
it('closes the decoder on codec rejection without allocating assets', async () => {
  io.decode.mockRejectedValue(new Error('codec'));
  await expect(importScenarioNarration(input())).rejects.toThrow('codec');
  expect(io.close).toHaveBeenCalledOnce();
  expect(io.write).not.toHaveBeenCalled();
});
it.each(['before', 'decode', 'stage'])(
  'cancels at %s and compensates only prepared assets',
  async (phase) => {
    const cancel = new AbortController();
    if (phase === 'before') cancel.abort();
    if (phase === 'decode')
      io.decode.mockImplementation(async () => {
        cancel.abort();
        return { duration: 2 };
      });
    if (phase === 'stage') {
      const write = io.write.getMockImplementation()!;
      io.write.mockImplementation(async (...args) => {
        const value = await write(...args);
        cancel.abort();
        return value;
      });
    }
    await expect(
      importScenarioNarration({ ...input(), signal: cancel.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(io.commit).not.toHaveBeenCalled();
    expect(io.discard).toHaveBeenCalledTimes(phase === 'stage' ? 1 : 0);
  }
);
it('propagates failed publication without running a second compensation authority', async () => {
  io.commit.mockRejectedValue(new Error('stale revision'));
  const args = input();
  await expect(importScenarioNarration(args)).rejects.toThrow('stale revision');
  expect(io.discard).not.toHaveBeenCalled();
  expect(io.event).not.toHaveBeenCalled();
  expect(args.project.tour!.slides[0]!.narration).toBeNull();
});
it('propagates allocation failure without attempting publication', async () => {
  io.write.mockRejectedValue(new Error('quota'));
  await expect(importScenarioNarration(input())).rejects.toThrow('quota');
  expect(io.commit).not.toHaveBeenCalled();
  expect(io.discard).not.toHaveBeenCalled();
});

it('rejects malformed project input before resource acquisition', async () => {
  const args = input();
  args.project.tour!.slides[0]!.timing.holdSeconds = -1;
  await expect(importScenarioNarration(args)).rejects.toThrow('Invalid scenario');
  expect(io.decode).not.toHaveBeenCalled();
  expect(io.write).not.toHaveBeenCalled();
});
