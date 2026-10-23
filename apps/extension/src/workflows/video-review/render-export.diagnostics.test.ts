import { expect, it, vi } from 'vitest';
import { state, argsFixture } from './render-export.test-support';
import { drainSegmentAudio, writeReviewFrames } from './render-export';
import { createReviewCaptionSettings } from '../../features/video/review/text-document';
import { createReviewExportDiagnostics } from './export-diagnostics';

const audio = vi.hoisted(() => ({ processed: vi.fn(), retained: vi.fn() }));
vi.mock('./audio-render', async (original) => ({
  ...(await original<typeof import('./audio-render')>()),
  renderReviewAudio: audio.processed,
}));
vi.mock('./packet-export', async (original) => ({
  ...(await original<typeof import('./packet-export')>()),
  retainedAudio: audio.retained,
}));

it.each(['processed', 'copy'] as const)(
  'retains %s audio encoding failures and closes its iterator',
  async (kind) => {
    const cause = new Error('private audio encoder refusal');
    const closed = vi.fn();
    const add = vi.fn(async () => {
      throw cause;
    });
    const iterator = async function* () {
      try {
        yield { timestamp: 0, duration: 1 };
      } finally {
        closed();
      }
    };
    (kind === 'processed' ? audio.processed : audio.retained).mockImplementation(iterator);
    const summary = vi.fn();
    const attempt = createReviewExportDiagnostics(
      { destination: 'gallery', route: 'render' },
      summary
    );
    const error = await attempt
      .phase('compose', () => drainSegmentAudio(audioArgs(kind, add)))
      .catch((value: unknown) => value);
    expect(error).toMatchObject({ stage: 'encode', cause });
    attempt.reportFailure(error);
    expect(summary).toHaveBeenCalledExactlyOnceWith(
      'export outcome=failed route=render destination=gallery stage=encode code=encode-failed'
    );
    expect(add).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  }
);

it.each(['processed', 'copy'] as const)('classifies %s audio iterator refusal', async (kind) => {
  const cause = new Error('private audio read refusal');
  (kind === 'processed' ? audio.processed : audio.retained).mockImplementation(async function* () {
    yield await Promise.reject(cause);
  });
  const add = vi.fn();
  const summary = vi.fn();
  const attempt = createReviewExportDiagnostics(
    { destination: 'gallery', route: 'render' },
    summary
  );
  const error = await attempt
    .phase('compose', () => drainSegmentAudio(audioArgs(kind, add)))
    .catch((value: unknown) => value);
  expect(error).toMatchObject({ stage: 'audio-prepare', cause });
  attempt.reportFailure(error);
  expect(summary).toHaveBeenCalledExactlyOnceWith(
    'export outcome=failed route=render destination=gallery stage=audio-prepare code=audio-prepare-failed'
  );
  expect(add).not.toHaveBeenCalled();
});

function audioArgs(kind: 'processed' | 'copy', add: ReturnType<typeof vi.fn>) {
  return {
    segment: { sourceStart: 0, sourceEnd: 1, resultStart: 0, resultEnd: 1, kind: 'keep', rate: 1 },
    track: null,
    sink: kind === 'copy' ? {} : null,
    audioOut: { kind, source: { add } },
    processedAudio: kind === 'processed' ? 'opus' : null,
    audioConfig: null,
    muted: false,
    exportAudio: undefined,
    sampleRate: 48_000,
    audioCodec: 'opus',
    clock: { time: 0 },
    receipt: { videoPackets: 0, audioPackets: 0, resultDuration: 1, audioRanges: [] },
    signal: new AbortController().signal,
  } as unknown as Parameters<typeof drainSegmentAudio>[0];
}

const decoration = vi.hoisted(() => ({ dispose: vi.fn() }));
vi.mock('../../features/video/composition/canvas/watermark', () => ({
  createWatermarkRenderer: async () => ({
    draw() {},
    bounds: null,
    dispose: decoration.dispose,
  }),
}));

it('preserves the encoding phase through frame composition failure cleanup', async () => {
  const cause = new Error('private encoder failure');
  const add = vi.fn(async () => {
    throw cause;
  });
  const failed = writeReviewFrames({ ...argsFixture(), frameProbe: { add } });
  await expect(failed).rejects.toMatchObject({ stage: 'encode', cause });
  expect(add).toHaveBeenCalledOnce();
  for (const sample of state.drawn) expect(sample.close).toHaveBeenCalledOnce();
});

it('compensates partially prepared decorations before returning a failed scene', async () => {
  decoration.dispose.mockClear();
  const args = argsFixture();
  args.advanced.captions = { ...createReviewCaptionSettings(), enabled: true };
  args.advanced.text = {
    version: 1,
    fragments: [
      {
        id: 'caption',
        start: 0,
        end: 2,
        text: 'Caption',
        originalText: 'Caption',
        timeDomain: 'result',
        revision: 0,
        timingRevision: 0,
        alignment: 'manual',
        showInVideo: true,
      },
    ],
  };
  const failed = writeReviewFrames({ ...args, fragmentOffset: 1 });
  await expect(failed).rejects.toMatchObject({ stage: 'compose' });
  await expect(failed).rejects.toThrow('Fragment captions require');
  expect(decoration.dispose).toHaveBeenCalledOnce();
  expect(state.encoded).toHaveLength(0);
});
