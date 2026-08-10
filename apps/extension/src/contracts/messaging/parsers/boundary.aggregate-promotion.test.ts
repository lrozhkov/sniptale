import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { parseRuntimeRequestMessage, parseRuntimeResponseForMessage } from './boundary';

it('parses strict aggregate promotion requests and responses', () => {
  expect(
    parseRuntimeRequestMessage({
      aggregate: { id: 'image-1', kind: 'image' },
      type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
    })
  ).toEqual({
    aggregate: { id: 'image-1', kind: 'image' },
    type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
  });
  expect(
    parseRuntimeResponseForMessage(MessageType.PROMOTE_AGGREGATE_TO_LIBRARY, {
      result: 'promoted',
      success: true,
    })
  ).toEqual({ result: 'promoted', success: true });
});

it.each([
  { aggregate: { id: '', kind: 'image' }, type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY },
  {
    aggregate: { id: 'image-1', kind: 'recording' },
    type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
  },
  {
    aggregate: { extra: true, id: 'image-1', kind: 'image' },
    type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
  },
])('rejects malformed aggregate promotion request %#', (message) => {
  expect(() => parseRuntimeRequestMessage(message)).toThrow();
});
