import { argsFixture, state } from './render-export.test-support';
import { expect, it, vi } from 'vitest';
import { writeReviewFrames } from './render-export';

const frames = vi.hoisted(() => ({
  rows: [] as Array<[number, number]>,
  flush: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('../../features/video/project/export/adaptive-frames', () => ({
  createAdaptiveFrameWriter: () => ({
    add: async (time: number, duration: number) => {
      frames.rows.push([time, duration]);
    },
    flush: frames.flush,
    dispose: frames.dispose,
  }),
}));

it('keeps rounded adjacent cut/speed windows contiguous, clips the tail and flushes each window', async () => {
  frames.rows = [];
  frames.flush.mockReset();
  frames.dispose.mockReset();
  const args = argsFixture();
  args.index.duration = 0.419;
  args.edits = [
    {
      id: 'speed',
      kind: 'speed',
      start: 0.137,
      end: 0.217,
      requestedStart: 0.137,
      requestedEnd: 0.217,
      rate: 2,
      audio: 'mute',
    },
    {
      id: 'cut',
      kind: 'cut',
      start: 0.301,
      end: 0.339,
      requestedStart: 0.301,
      requestedEnd: 0.339,
    },
  ];
  await writeReviewFrames({
    ...args,
    renderSettings: { quality: 'HIGH', frameRate: 60, frameRateMode: 'adaptive' },
  });
  expect(frames.rows[0]![0]).toBe(0);
  for (let i = 1; i < frames.rows.length; i++)
    expect(frames.rows[i]![0]).toBe(frames.rows[i - 1]![0] + frames.rows[i - 1]![1]);
  const last = frames.rows.at(-1)!;
  expect(last[0] + last[1]).toBe(341_000);
  expect(frames.rows.every(([, duration]) => duration > 0 && duration <= 16667)).toBe(true);
  expect(frames.flush).toHaveBeenCalledTimes(4);
  expect(frames.dispose).toHaveBeenCalledTimes(4);
  expect(state.encoded).toHaveLength(0);
});

it('disposes the pending adaptive writer when completion encoding fails', async () => {
  frames.dispose.mockReset();
  frames.flush.mockRejectedValueOnce(new Error('encoder failed'));
  await expect(
    writeReviewFrames({
      ...argsFixture(),
      renderSettings: { quality: 'HIGH', frameRate: 60, frameRateMode: 'adaptive' },
    })
  ).rejects.toThrow('encoder failed');
  expect(frames.dispose).toHaveBeenCalledOnce();
});

it('does not emit a tail which rounds to zero microseconds', async () => {
  frames.rows = [];
  const args = argsFixture();
  args.index.duration = 1 + 0.0000001;
  await writeReviewFrames({
    ...args,
    renderSettings: { quality: 'HIGH', frameRate: 60, frameRateMode: 'adaptive' },
  });
  expect(frames.rows.every(([, duration]) => duration > 0)).toBe(true);
  const last = frames.rows.at(-1)!;
  expect(last[0] + last[1]).toBe(1_000_000);
});
