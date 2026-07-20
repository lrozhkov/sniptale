import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CaptureMessageType } from '@sniptale/runtime-contracts/messaging/capture-messages';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  consumeAutoStartGrantForCapabilityRequest,
  issueContentPrivilegedActionAutoStartGrant,
  resetContentPrivilegedActionCapabilityStoreForTests,
  type ContentSenderBinding,
} from './capability-store';

const senderBinding: ContentSenderBinding = {
  documentId: 'doc-1',
  frameId: 0,
  senderUrl: 'https://example.test/page',
  tabId: 7,
};

beforeEach(() => {
  resetContentPrivilegedActionCapabilityStoreForTests();
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'grant-token-1') });
});

afterEach(() => {
  resetContentPrivilegedActionCapabilityStoreForTests();
  vi.unstubAllGlobals();
});

it('budgets auto-start grants by sender tab and action type', () => {
  const grant = issueContentPrivilegedActionAutoStartGrant({
    actionTypes: [CaptureMessageType.CAPTURE_VISIBLE, MessageType.EXECUTE_SAVE],
    tabId: 7,
  });
  const source = { grantToken: grant.grantToken, kind: 'background-auto-start' as const };

  expect(
    consumeAutoStartGrantForCapabilityRequest({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      senderBinding,
      source,
    })
  ).toBe(true);
  expect(
    consumeAutoStartGrantForCapabilityRequest({
      actionType: CaptureMessageType.CAPTURE_FULL,
      senderBinding,
      source,
    })
  ).toBe(false);
  expect(
    consumeAutoStartGrantForCapabilityRequest({
      actionType: MessageType.EXECUTE_SAVE,
      senderBinding: { ...senderBinding, tabId: 8 },
      source,
    })
  ).toBe(false);
});
