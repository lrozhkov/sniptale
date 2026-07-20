import { expect, it } from 'vitest';

import {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { PageAccessOperation } from '@sniptale/runtime-contracts/messaging/page-access';
import { runtimeActionCoreMessageContracts } from './core';

const pageAccessContract = runtimeActionCoreMessageContracts[MessageType.PAGE_ACCESS];
const activationKeyContract =
  runtimeActionCoreMessageContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY];
const runtimeTokenContract =
  runtimeActionCoreMessageContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN];
const contentRuntimeWakeupContract =
  runtimeActionCoreMessageContracts[MessageType.CONTENT_RUNTIME_WAKEUP];
const offscreenPageStorageContract =
  runtimeActionCoreMessageContracts[MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE];

it('parses page-access requests', () => {
  expect(
    pageAccessContract.parseRequest({
      operation: PageAccessOperation.ACTIVATE_CURRENT_TAB,
      tabId: 7,
      type: MessageType.PAGE_ACCESS,
    })
  ).toEqual({
    operation: PageAccessOperation.ACTIVATE_CURRENT_TAB,
    tabId: 7,
    type: MessageType.PAGE_ACCESS,
  });
});

it('parses page-access responses', () => {
  expect(
    pageAccessContract.parseResponse({
      result: 'activated',
      status: {
        allSitesGranted: false,
        currentTabActive: true,
        currentTabId: 7,
        currentTabOrigin: 'https://example.test',
        siteGranted: false,
        supported: true,
      },
      success: true,
    })
  ).toEqual(
    expect.objectContaining({
      result: 'activated',
      success: true,
    })
  );
});

it('rejects unsupported operations', () => {
  expect(() =>
    pageAccessContract.parseRequest({
      operation: 'grant-everything',
      type: MessageType.PAGE_ACCESS,
    })
  ).toThrow();
});

it('rejects malformed statuses', () => {
  expect(() =>
    pageAccessContract.parseResponse({
      status: {
        allSitesGranted: false,
        currentTabActive: true,
        currentTabId: '7',
        currentTabOrigin: 'https://example.test',
        siteGranted: false,
        supported: true,
      },
      success: true,
    })
  ).toThrow();
});

it('parses content privileged activation-key requests and responses', () => {
  expect(
    activationKeyContract.parseRequest({
      purpose: 'trusted-content-event',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
    })
  ).toEqual({
    purpose: 'trusted-content-event',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
  });
  expect(
    activationKeyContract.parseResponse({
      activationKey: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
      success: true,
    })
  ).toEqual({
    activationKey: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
    success: true,
  });
});

it('parses content runtime wake-up responses with bounded restore reasons', () => {
  expect(
    contentRuntimeWakeupContract.parseResponse({
      reason: 'pin-to-tab',
      restored: true,
      success: true,
    })
  ).toEqual({
    reason: 'pin-to-tab',
    restored: true,
    success: true,
  });
  expect(
    contentRuntimeWakeupContract.parseResponse({
      reason: 'scenario',
      restored: true,
      success: true,
    })
  ).toEqual({
    reason: 'scenario',
    restored: true,
    success: true,
  });
  expect(() =>
    contentRuntimeWakeupContract.parseResponse({
      reason: 'other',
      restored: true,
      success: true,
    })
  ).toThrow();
});

it('parses content runtime wake-up requests', () => {
  expect(
    contentRuntimeWakeupContract.parseRequest({
      type: MessageType.CONTENT_RUNTIME_WAKEUP,
    })
  ).toEqual({
    type: MessageType.CONTENT_RUNTIME_WAKEUP,
  });
});

it('strictly parses the offscreen page-storage privacy command and result', () => {
  expect(
    offscreenPageStorageContract.parseRequest({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability-1',
      operation: 'erase',
      preservePreferences: true,
    })
  ).toEqual(
    expect.objectContaining({
      operation: 'erase',
      preservePreferences: true,
    })
  );
  expect(
    offscreenPageStorageContract.parseResponse({
      success: true,
      empty: true,
      removedCount: 2,
    })
  ).toEqual({ success: true, empty: true, removedCount: 2 });
  expect(() =>
    offscreenPageStorageContract.parseRequest({
      type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
      capabilityToken: 'capability-1',
      operation: 'drop-all',
      preservePreferences: true,
    })
  ).toThrow();
});

it('requires activation proof and operation binding for runtime-token requests', () => {
  expect(
    runtimeTokenContract.parseRequest({
      activationProof: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    })
  ).toEqual({
    activationProof: { expiresAtEpochMs: 1_000, keyId: 'activation-1', secret: 'secret-1' },
    actionType: CaptureMessageType.CAPTURE_VISIBLE,
    requestId: 'request-1',
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
  });
  expect(() =>
    runtimeTokenContract.parseRequest({
      actionType: CaptureMessageType.CAPTURE_VISIBLE,
      requestId: 'request-1',
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
    })
  ).toThrow();
});
