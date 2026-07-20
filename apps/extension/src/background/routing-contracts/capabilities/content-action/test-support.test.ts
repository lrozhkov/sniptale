import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { resetContentPrivilegedActionCapabilitiesForTests } from './route';
import { issueContentActionRuntimeTokenForTest } from './test-support';

function contentSender(): chrome.runtime.MessageSender {
  return {
    documentId: 'content-doc-1',
    frameId: 0,
    tab: { id: 7 } as chrome.tabs.Tab,
    url: 'https://example.test/page',
  };
}

beforeEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'content-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilitiesForTests();
  vi.unstubAllGlobals();
});

it('reissues stale cached activation keys', () => {
  const sender = contentSender();

  expect(issueContentActionRuntimeTokenForTest(sender)).toEqual(expect.any(String));
  expect(issueContentActionRuntimeTokenForTest(sender)).toEqual(expect.any(String));
});
