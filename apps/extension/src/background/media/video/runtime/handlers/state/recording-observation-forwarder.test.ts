import { afterEach, expect, it, vi } from 'vitest';
import { createRecordingObservationForwarder } from './recording-observation-forwarder';
const request = (source: string) => ({
  key: 'recording-generation-stream-tab',
  source,
  outgoing: false,
  closing: false,
  endsSource: false,
  lastBatch: 0,
  fingerprint: source,
  verify: async () => true,
  isCurrent: () => true,
  publish: vi.fn(async () => {}),
});
function accepted(result: ReturnType<ReturnType<typeof createRecordingObservationForwarder>>) {
  if (!result.accepted) throw new Error(result.error);
  return result.completion;
}
afterEach(() => vi.useRealTimers());
it('drains the predecessor after successor reservation but before its canonical admission', async () => {
  const forward = createRecordingObservationForwarder();
  const first = request('A');
  await accepted(forward(first));
  const successor = request('B');
  const next = accepted(forward(successor));
  await Promise.resolve();
  expect(successor.publish).not.toHaveBeenCalled();
  const closing = {
    ...request('A'),
    outgoing: true,
    closing: true,
    endsSource: true,
    lastBatch: 1,
  };
  await accepted(forward(closing));
  await next;
  expect(closing.publish.mock.invocationCallOrder[0]).toBeLessThan(
    successor.publish.mock.invocationCallOrder[0]!
  );
  expect(forward({ ...closing, fingerprint: 'late' })).toEqual({
    accepted: false,
    error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE',
  });
});
it('orders rapid verified reservations and their already received closing tails', async () => {
  const forward = createRecordingObservationForwarder();
  await accepted(forward(request('A')));
  const b = request('B');
  const c = request('A-new-clock');
  const pb = accepted(forward(b));
  const pc = accepted(forward(c));
  const endB = { ...request('B'), outgoing: true, closing: true, endsSource: true, lastBatch: 1 };
  const eb = accepted(forward(endB));
  expect(forward(request('overflow')).accepted).toBe(false);
  await accepted(
    forward({ ...request('A'), outgoing: true, closing: true, endsSource: true, lastBatch: 1 })
  );
  await Promise.all([pb, eb, pc]);
  expect(b.publish.mock.invocationCallOrder[0]).toBeLessThan(
    endB.publish.mock.invocationCallOrder[0]!
  );
  expect(endB.publish.mock.invocationCallOrder[0]).toBeLessThan(
    c.publish.mock.invocationCallOrder[0]!
  );
});
it('refuses unknown outgoing sources and failed native reservations', async () => {
  const forward = createRecordingObservationForwarder();
  expect(forward({ ...request('unknown'), outgoing: true }).accepted).toBe(false);
  await expect(accepted(forward({ ...request('A'), verify: async () => false }))).rejects.toThrow();
  expect(forward({ ...request('A'), outgoing: true }).accepted).toBe(false);
});
it('bounds the predecessor wait and rejects superseded recording callbacks', async () => {
  vi.useFakeTimers();
  const forward = createRecordingObservationForwarder();
  await accepted(forward(request('A')));
  const next = request('B');
  const done = accepted(forward(next));
  await vi.advanceTimersByTimeAsync(2000);
  await done;
  expect(next.publish).toHaveBeenCalledOnce();
  const stale = request('C');
  const rejected = expect(accepted(forward(stale))).rejects.toThrow('Source binding');
  await accepted(forward({ ...request('new-recording'), key: 'new' }));
  await rejected;
  expect(stale.publish).not.toHaveBeenCalled();
});
it('coalesces final retries and refuses reopening the closed incarnation', async () => {
  const forward = createRecordingObservationForwarder();
  await accepted(forward(request('A')));
  const gate = Promise.withResolvers<void>();
  const end = {
    ...request('A'),
    closing: true,
    endsSource: true,
    lastBatch: 1,
    publish: vi.fn(() => gate.promise),
  };
  const one = accepted(forward(end));
  const two = accepted(forward(end));
  expect(one).toBe(two);
  gate.resolve();
  await one;
  expect(end.publish).toHaveBeenCalledOnce();
  expect(forward({ ...request('A'), lastBatch: 2 }).accepted).toBe(false);
  expect(forward({ ...end, fingerprint: 'conflicting' }).accepted).toBe(false);
});

it('retries the exact final batch after a transport refusal without allowing a conflicting tail', async () => {
  const forward = createRecordingObservationForwarder();
  await accepted(forward(request('A')));
  const publish = vi
    .fn()
    .mockRejectedValueOnce(new Error('channel'))
    .mockResolvedValueOnce(undefined);
  const end = { ...request('A'), closing: true, endsSource: true, lastBatch: 1, publish };
  await expect(accepted(forward(end))).rejects.toThrow('channel');
  expect(forward({ ...end, fingerprint: 'conflict' }).accepted).toBe(false);
  await accepted(forward(end));
  expect(publish).toHaveBeenCalledTimes(2);
});

it('does not admit a successor while the predecessor transport remains unresolved after the budget', async () => {
  vi.useFakeTimers();
  const forward = createRecordingObservationForwarder();
  const gate = Promise.withResolvers<void>();
  const first = accepted(forward({ ...request('A'), publish: () => gate.promise }));
  await Promise.resolve();
  const successor = request('B');
  const refused = expect(accepted(forward(successor))).rejects.toThrow('Source drain');
  // Initial admission is serialized until the first source is known to the writer.
  gate.resolve();
  await first;
  const blocker = Promise.withResolvers<void>();
  const tail = accepted(forward({ ...request('A'), publish: () => blocker.promise }));
  await vi.advanceTimersByTimeAsync(2000);
  await refused;
  expect(successor.publish).not.toHaveBeenCalled();
  blocker.resolve();
  await tail;
});

it('refuses a restored retired incarnation after a lost closing reply and admits a fresh return clock', async () => {
  const forward = createRecordingObservationForwarder();
  const old = { ...request('A:old-clock'), closing: true, endsSource: true, lastBatch: 3 };
  await accepted(forward(old));
  // The source did not receive this success before BFCache froze its response channel.
  await accepted(forward({ ...request('B:clock'), closing: true, endsSource: true }));
  expect(forward({ ...old, outgoing: false })).toEqual({
    accepted: false,
    error: 'RECORDING_OBSERVATIONS_SOURCE_UNAVAILABLE',
  });
  expect(old.publish).toHaveBeenCalledOnce();
  const fresh = { ...request('A:fresh-clock'), closing: true, endsSource: true };
  await accepted(forward(fresh));
  expect(fresh.publish).toHaveBeenCalledOnce();
});

it('bounds retired identities without eviction and resets them only for another recording binding', async () => {
  const forward = createRecordingObservationForwarder();
  for (let index = 0; index <= 4096; index++) {
    await accepted(forward({ ...request(`source-${index}`), closing: true, endsSource: true }));
  }
  expect(forward(request('source-0')).accepted).toBe(false);
  expect(forward(request('overflow')).accepted).toBe(false);
  await accepted(forward({ ...request('source-4096'), closing: true, endsSource: true }));
  const nextRecording = { ...request('source-0'), key: 'new-recording-binding' };
  await accepted(forward(nextRecording));
  expect(nextRecording.publish).toHaveBeenCalledOnce();
});
