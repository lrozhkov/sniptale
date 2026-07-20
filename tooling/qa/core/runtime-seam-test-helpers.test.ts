// @vitest-environment jsdom
import { expect, it } from 'vitest';

import {
  createFakeLogger,
  createFakeRuntimeTransport,
  createModuleMockBag,
  createSameOriginIframeDocument,
} from './runtime-seam-test-helpers';

it('creates typed fake loggers with callable spies', () => {
  const logger = createFakeLogger();
  logger.warn('warning');

  expect(logger.warn).toHaveBeenCalledWith('warning');
  expect(typeof logger.error.mock.calls).toBe('object');
});

it('creates typed fake runtime transport spies', () => {
  const transport = createFakeRuntimeTransport();
  transport.sendMessage({ type: 'PING' });

  expect(transport.sendMessage).toHaveBeenCalledWith({ type: 'PING' });
});

it('creates typed module mock bags that can be reused inside hoisted seams', () => {
  const mockBag = createModuleMockBag(['warn', 'sendMessage'] as const);
  mockBag.warn('warning');

  expect(mockBag.warn).toHaveBeenCalledWith('warning');
  expect(typeof mockBag.sendMessage.mock.calls).toBe('object');
});

it('creates same-origin iframe documents with both contentDocument and contentWindow.document', () => {
  const iframeState = createSameOriginIframeDocument('<p>Hello</p>');

  expect(iframeState.iframe.contentDocument?.body.textContent).toContain('Hello');
  expect(iframeState.iframe.contentWindow?.document.body.textContent).toContain('Hello');
});
