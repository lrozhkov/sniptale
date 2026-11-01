import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NativeAppOutboundMessage } from '../../../contracts/native-app';
import { createNativeHistoryRetry } from './service-history-retry';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const request = (controllerLeaseId: string): NativeAppOutboundMessage => ({
  type: 'extension.recording.events.manifest.request',
  protocolVersion: 2,
  recordingId: 'recording',
  eventStreamId: 'a'.repeat(32),
  requestId: 'request',
  nextSequence: 0,
  prefixSha256: 'b'.repeat(64),
  controllerLeaseId,
});
function fixture() {
  let target: { connectionId: string; controllerLeaseId: string } | null = {
    connectionId: 'port-A',
    controllerLeaseId: 'lease-A',
  };
  const resume = vi
    .fn<(lease: string) => Promise<NativeAppOutboundMessage[]>>()
    .mockResolvedValue([]);
  const post = vi.fn();
  const warn = vi.fn();
  const retry = createNativeHistoryRetry({ target: () => target, resume, post, warn });
  return {
    retry,
    resume,
    post,
    warn,
    setTarget(next: typeof target) {
      target = next;
    },
  };
}
it('paces retries at two seconds and keeps one active operation while a request is delayed', async () => {
  const f = fixture();
  const delayed = Promise.withResolvers<NativeAppOutboundMessage[]>();
  f.resume.mockReturnValueOnce(delayed.promise);
  f.retry.start();
  await vi.advanceTimersByTimeAsync(1999);
  expect(f.resume).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(f.resume).toHaveBeenCalledExactlyOnceWith('lease-A');
  await vi.advanceTimersByTimeAsync(10000);
  expect(f.resume).toHaveBeenCalledOnce();
  delayed.resolve([request('lease-A')]);
  await Promise.resolve();
  expect(f.post).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.resume).toHaveBeenCalledTimes(2);
  f.retry.stop();
});
it.each(['stop', 'disconnect'] as const)(
  'does not post a delayed result after %s',
  async (reason) => {
    const f = fixture();
    const delayed = Promise.withResolvers<NativeAppOutboundMessage[]>();
    f.resume.mockReturnValueOnce(delayed.promise);
    f.retry.start();
    await vi.advanceTimersByTimeAsync(2000);
    if (reason === 'stop') f.retry.stop();
    else f.setTarget(null);
    delayed.resolve([request('lease-A')]);
    await vi.advanceTimersByTimeAsync(10000);
    expect(f.post).not.toHaveBeenCalled();
    expect(f.resume).toHaveBeenCalledOnce();
  }
);
it('starts the new connection after old work settles without overlap or a stale post', async () => {
  const f = fixture();
  const delayed = Promise.withResolvers<NativeAppOutboundMessage[]>();
  f.resume.mockReturnValueOnce(delayed.promise).mockResolvedValue([request('lease-B')]);
  f.retry.start();
  await vi.advanceTimersByTimeAsync(2000);
  f.setTarget({ connectionId: 'port-B', controllerLeaseId: 'lease-B' });
  f.retry.start();
  await vi.advanceTimersByTimeAsync(4000);
  expect(f.resume).toHaveBeenCalledOnce();
  delayed.resolve([request('lease-A')]);
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.resume.mock.calls).toEqual([['lease-A'], ['lease-B']]);
  expect(f.post.mock.calls).toEqual([[request('lease-B')]]);
  f.retry.stop();
});
it('retries a transient failure and ignores responses for another lease', async () => {
  const f = fixture();
  f.resume
    .mockRejectedValueOnce(new Error('archive-busy'))
    .mockResolvedValue([request('lease-B'), request('lease-A')]);
  f.retry.start();
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.warn).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(2000);
  expect(f.post.mock.calls).toEqual([[request('lease-A')]]);
  f.retry.stop();
});
