import { describe, expect, it } from 'vitest';

import {
  isLoadingFailedEvent,
  isLoadingFinishedEvent,
  isRequestWillBeSentEvent,
  isResponseReceivedEvent,
} from './events';

function verifyValidRequestAndResponsePayloads() {
  expect(
    isRequestWillBeSentEvent({
      requestId: 'request-1',
      type: 'Fetch',
      request: {
        method: 'GET',
        url: 'https://example.test/api/items?q=1',
        headers: {
          Accept: 'application/json',
        },
      },
    })
  ).toBe(true);

  expect(
    isResponseReceivedEvent({
      requestId: 'request-1',
      response: {
        status: 200,
        statusText: 'OK',
        mimeType: 'application/json',
        headers: {
          'content-type': 'application/json',
        },
        protocol: 'h2',
      },
    })
  ).toBe(true);
}

function verifyMalformedRequestAndResponseHeaders() {
  expect(
    isRequestWillBeSentEvent({
      requestId: 'request-1',
      request: {
        method: 'GET',
        url: 'https://example.test/api/items?q=1',
        headers: {
          Accept: 200,
        },
      },
    })
  ).toBe(false);

  expect(
    isResponseReceivedEvent({
      requestId: 'request-1',
      response: {
        status: 200,
        statusText: 'OK',
        headers: {
          'content-type': 200,
        },
      },
    })
  ).toBe(false);
}

function verifyOptionalLoadingFields() {
  expect(
    isRequestWillBeSentEvent({
      requestId: 'request-1',
      request: {
        method: 'GET',
        url: 'https://example.test/api/items?q=1',
      },
    })
  ).toBe(true);
  expect(
    isResponseReceivedEvent({
      requestId: 'request-1',
      response: {
        status: 204,
        statusText: 'No Content',
      },
    })
  ).toBe(true);
  expect(
    isLoadingFinishedEvent({
      requestId: 'request-1',
      encodedDataLength: 321,
    })
  ).toBe(true);
  expect(
    isLoadingFailedEvent({
      requestId: 'request-1',
      errorText: 'Connection reset',
    })
  ).toBe(true);
}

function verifyMalformedOptionalPayloads() {
  expect(
    isLoadingFinishedEvent({
      requestId: 'request-1',
      encodedDataLength: '321',
    })
  ).toBe(false);
  expect(
    isLoadingFailedEvent({
      requestId: 10,
    })
  ).toBe(false);
  expect(isRequestWillBeSentEvent('bad-payload')).toBe(false);
  expect(
    isRequestWillBeSentEvent({
      requestId: 'request-1',
      request: {
        method: 'GET',
        url: 'https://example.test/api/items?q=1',
        headers: null,
      },
    })
  ).toBe(false);
  expect(isResponseReceivedEvent(null)).toBe(false);
  expect(
    isResponseReceivedEvent({
      requestId: 'request-1',
      response: {
        status: 204,
        statusText: 'No Content',
        headers: null,
      },
    })
  ).toBe(false);
  expect(isLoadingFinishedEvent(null)).toBe(false);
  expect(isLoadingFailedEvent(null)).toBe(false);
}

describe('export HAR event guards', () => {
  it('accepts valid request and response debugger payloads', verifyValidRequestAndResponsePayloads);

  it(
    'rejects malformed request and response header payloads',
    verifyMalformedRequestAndResponseHeaders
  );

  it('accepts optional loading payload fields', verifyOptionalLoadingFields);

  it('rejects malformed optional payload and header types', verifyMalformedOptionalPayloads);
});
