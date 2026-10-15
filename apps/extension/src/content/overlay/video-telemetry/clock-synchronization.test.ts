import { expect, it, vi } from 'vitest';
import { createRecordingClockSynchronizer } from './clock-synchronization';
import type { RecordingFrameClockAnchor } from '../../../contracts/video/recording-frame-clock';
const binding = { recordingId: 'recording', generation: 2, streamInstanceId: 'source' };
const anchor: RecordingFrameClockAnchor = {
  ...binding,
  revision: 1,
  phase: 'active',
  captureEpochMs: 103458.233,
  mediaTimeSeconds: 0,
  uncertaintyMs: 0.3,
  maximumUncertaintyMs: 8,
};
function fixture(offset = 3458.233, latency = 1) {
  let clock = 100;
  const exchange = vi.fn(async () => {
    const start = clock;
    clock += latency;
    return {
      success: true,
      clockTiming: {
        ...binding,
        receivedAtMs: start + offset + 0.25,
        repliedAtMs: start + offset + 0.9,
        maximumUncertaintyMs: 8,
      },
    };
  });
  return { exchange, sync: createRecordingClockSynchronizer(exchange, () => clock) };
}
it('bounds native time and preserves PTS while reusing the document binding for pause', async () => {
  const f = fixture();
  const before = JSON.stringify(anchor);
  const result = await f.sync.localize(anchor, true);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('fixture not admitted');
  expect(Math.abs(result.anchor.captureEpochMs - 100000)).toBeLessThanOrEqual(
    result.anchor.uncertaintyMs!
  );
  expect(result.anchor.mediaTimeSeconds).toBe(0);
  expect(result.anchor.uncertaintyMs).toBeLessThan(8);
  expect(f.exchange).toHaveBeenCalledTimes(3);
  expect(f.exchange).toHaveBeenCalledWith(binding);
  const paused = await f.sync.localize({
    ...anchor,
    revision: 2,
    phase: 'paused',
    mediaTimeSeconds: 0.4,
  });
  expect(paused.status).toBe('ready');
  expect(f.exchange).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(anchor)).toBe(before);
});
it('retains an over-budget estimate with its measured uncertainty, never receipt time', async () => {
  const f = fixture(3458.233, 100);
  const result = await f.sync.localize(anchor, true);
  expect(result.status).toBe('ready');
  if (result.status !== 'ready') throw new Error('Missing estimate');
  expect(result.anchor.uncertaintyMs).toBeGreaterThan(8);
  expect(Math.abs(result.anchor.captureEpochMs - 100000)).toBeLessThanOrEqual(
    result.anchor.uncertaintyMs!
  );
  expect(result.anchor.maximumUncertaintyMs).toBe(8);
  expect(f.exchange).toHaveBeenCalledTimes(3);
});
it('refuses stale generation and malformed timing values from the receiver', async () => {
  for (const timing of [
    { ...binding, generation: 3, receivedAtMs: 1, repliedAtMs: 2, maximumUncertaintyMs: 8 },
    { ...binding, receivedAtMs: NaN, repliedAtMs: 2, maximumUncertaintyMs: 8 },
  ]) {
    const sync = createRecordingClockSynchronizer(
      async () => ({ clockTiming: timing }),
      () => 1
    );
    expect(await sync.localize(anchor, true)).toEqual({ status: 'unavailable' });
  }
});
it('invalidates pending results when the source document or recording session is superseded', async () => {
  let resolve!: (value: unknown) => void;
  const sync = createRecordingClockSynchronizer(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => 1
  );
  const pending = sync.localize(anchor, true);
  sync.invalidate();
  resolve({
    clockTiming: { ...binding, receivedAtMs: 1, repliedAtMs: 1, maximumUncertaintyMs: 8 },
  });
  expect(await pending).toEqual({ status: 'stale' });
});
it('keeps optional transport failure advisory and does not admit a missing clock reply', async () => {
  const sync = createRecordingClockSynchronizer(
    async () => {
      throw new Error('transport failed');
    },
    () => 1
  );
  expect(await sync.localize(anchor, true)).toEqual({ status: 'unavailable' });
});
