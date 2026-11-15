import { expect, it, vi } from 'vitest';
import { createClosingObservationDrain } from './closing-batch';

const valid = (value: unknown): value is { id: number }[] =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'number'
  );

it('sends the complete snapshot synchronously and coalesces a pending close', async () => {
  const acknowledged = Promise.withResolvers<void>();
  const send = vi.fn(() => acknowledged.promise);
  const pending = [{ id: 2 }, { id: 3 }];
  const drain = createClosingObservationDrain({
    inFlight: () => ({ id: 1 }),
    takeNext: () => pending.shift() ?? null,
    isValid: valid,
    send,
  });
  const first = drain();
  expect(send).toHaveBeenCalledExactlyOnceWith([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(drain()).toBe(first);
  acknowledged.resolve();
  expect(await first).toBe(true);
  expect(await drain()).toBe(true);
  expect(send).toHaveBeenCalledOnce();
});

it('retains an exact closing batch after rejection even if the original in-flight data changes', async () => {
  const previous = { id: 1 };
  const takeNext = vi.fn(() => null);
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('channel closed'))
    .mockResolvedValueOnce(undefined);
  const drain = createClosingObservationDrain({
    inFlight: () => previous,
    takeNext,
    isValid: valid,
    send,
  });
  expect(await drain()).toBe(false);
  previous.id = 9;
  expect(await drain()).toBe(true);
  expect(send.mock.calls.map(([packets]) => packets)).toEqual([[{ id: 1 }], [{ id: 1 }]]);
  expect(takeNext).toHaveBeenCalledOnce();
});

it('refuses an invalid closing batch before invoking the native transport', async () => {
  const send = vi.fn();
  const drain = createClosingObservationDrain({
    inFlight: () => ({ id: 1 }),
    takeNext: () => null,
    isValid: (_value: unknown): _value is { id: number }[] => false,
    send,
  });
  expect(await drain()).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
