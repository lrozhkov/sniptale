import { beforeEach, expect, it, vi } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

const mocks = vi.hoisted(() => ({ coordinate: vi.fn() }));

vi.mock('./coordinator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./coordinator')>()),
  coordinateAggregatePromotion: mocks.coordinate,
}));

import { routeAggregatePromotionMessage } from './route';

beforeEach(() => vi.clearAllMocks());

it.each([null, [], 'message', {}, { type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY }])(
  'rejects malformed and non-owned messages without responding: %j',
  (message) => {
    const respond = vi.fn();
    expect(routeAggregatePromotionMessage(message, respond)).toBe(false);
    expect(respond).not.toHaveBeenCalled();
    expect(mocks.coordinate).not.toHaveBeenCalled();
  }
);

it('responds after success and accepts an explicit replay as a separate command', async () => {
  mocks.coordinate.mockResolvedValue(undefined);
  const respond = vi.fn();
  const message = {
    aggregate: { id: 'image-1', kind: 'image' },
    type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
  };

  expect(routeAggregatePromotionMessage(message, respond)).toBe(true);
  expect(routeAggregatePromotionMessage(message, respond)).toBe(true);
  await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(2));
  expect(mocks.coordinate).toHaveBeenCalledTimes(2);
  expect(respond).toHaveBeenCalledWith({ result: 'promoted', success: true });
});

it.each([
  [new Error('stale revision'), 'stale revision'],
  ['failure', 'Could not save this project.'],
])('surfaces promotion failure without a success response', async (failure, expectedError) => {
  mocks.coordinate.mockRejectedValueOnce(failure);
  const respond = vi.fn();
  expect(
    routeAggregatePromotionMessage(
      {
        aggregate: { id: 'scenario-1', kind: 'scenario' },
        type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
      },
      respond
    )
  ).toBe(true);
  await vi.waitFor(() =>
    expect(respond).toHaveBeenCalledWith({ error: expectedError, success: false })
  );
});
