import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { resetContentPrivilegedActionCapabilitiesForTests } from './route';
import {
  issueContentActionActivationKeyForTest,
  issueContentActionRuntimeTokenForTest,
} from './test-support';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('issues consecutive runtime tokens after activation-key consumption', () => {
  const sender = contentSender();

  expect(issueContentActionRuntimeTokenForTest(sender)).toEqual(expect.any(String));
  expect(issueContentActionRuntimeTokenForTest(sender)).toEqual(expect.any(String));
});

it('reissues an activation key that expires before the runtime-token exchange', () => {
  vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValue(31_001);

  expect(issueContentActionRuntimeTokenForTest(contentSender())).toEqual(expect.any(String));
});

it('reuses the cached key when the same sender has already claimed activation', () => {
  const sender = contentSender();
  const activationKey = issueContentActionActivationKeyForTest(sender);

  expect(issueContentActionActivationKeyForTest(sender)).toEqual(activationKey);
});

it('issues runtime tokens for explicit action and request identities', () => {
  expect(
    issueContentActionRuntimeTokenForTest(contentSender(), {
      actionType: MessageType.OPEN_EXPORT_MODAL,
      requestId: 'export-request-1',
    })
  ).toEqual(expect.any(String));
});
