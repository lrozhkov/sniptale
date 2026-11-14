import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForRequest,
} from '../../../parsers/boundary';
const request = {
  type: MessageType.EDITOR_VECTOR_CATALOG_COMMAND,
  operation: 'search' as const,
  requestId: 'request',
  source: { sourceId: 'https://example.test/', incarnation: 'source', generation: 1 },
  query: 'heart',
};
it('registers the typed request and response in the actual runtime boundary parser', () => {
  expect(parseRuntimeRequestMessage(request)).toMatchObject(request);
  expect(
    parseRuntimeResponseForRequest(request, {
      success: true,
      operation: 'search',
      source: request.source,
      data: { icons: ['mdi:heart'], start: 0, limit: 32 },
    })
  ).toMatchObject({ success: true });
  expect(() => parseRuntimeRequestMessage({ ...request, query: null })).toThrow();
  expect(() =>
    parseRuntimeResponseForRequest(request, { success: false, error: 'provider private body' })
  ).toThrow();
});
