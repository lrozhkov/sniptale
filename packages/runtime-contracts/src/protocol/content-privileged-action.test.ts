import { expect, it } from 'vitest';

import { CaptureMessageType, MessageType } from '../messaging/message-types';
import { CONTENT_PRIVILEGED_ACTION_TYPES } from './content-privileged-action';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionActivationProof,
  isContentPrivilegedActionActivationPurpose,
  isContentPrivilegedActionAutoStartGrant,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRequestSource,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
  isContentPrivilegedActionType,
} from './content-privileged-action';

it('matches the exact protected message type set', () => {
  expect(CONTENT_PRIVILEGED_ACTION_TYPES).toEqual([
    CaptureMessageType.CAPTURE_VISIBLE,
    CaptureMessageType.CAPTURE_FULL,
    CaptureMessageType.CAPTURE_VISIBLE_FOR_CROP,
    MessageType.EXPORT_CAPTURE_FULL_PAGE,
    MessageType.EXECUTE_SAVE,
    MessageType.OPEN_EDITOR_WITH_IMAGE,
    MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    MessageType.RELEASE_RECORDING_DOWNLOAD,
    MessageType.TRIGGER_QUICK_ACTION,
  ]);
});

it('classifies staged recording download routes as content privileged action types', () => {
  expect(isContentPrivilegedActionType(MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK)).toBe(true);
  expect(isContentPrivilegedActionType(MessageType.SAVE_RECORDING_FOR_DOWNLOAD)).toBe(true);
  expect(isContentPrivilegedActionType(MessageType.RELEASE_RECORDING_DOWNLOAD)).toBe(true);
  expect(isContentPrivilegedActionType('UNLISTED_RECORDING_ROUTE')).toBe(false);
});

it('validates content privileged action capabilities and request sources narrowly', () => {
  expect(isContentPrivilegedActionCapability({ requestId: 'request-1', token: 'token-1' })).toBe(
    true
  );
  expect(
    isContentPrivilegedActionCapability({
      requestId: 'request-1',
      token: 'token-1',
      extra: true,
    })
  ).toBe(false);
  expect(isContentPrivilegedActionAutoStartGrant({ grantToken: 'grant-1' })).toBe(true);
  expect(isContentPrivilegedActionAutoStartGrant({ grantToken: 'grant-1', extra: true })).toBe(
    false
  );
  expect(isContentPrivilegedActionRequestSource({ kind: 'trusted-content-event' })).toBe(false);
  expect(
    isContentPrivilegedActionRequestSource({
      kind: 'trusted-content-event-proof',
      proofToken: 'proof-1',
    })
  ).toBe(true);
  expect(isContentPrivilegedActionRequestSource({ kind: 'trusted-content-event-proof' })).toBe(
    false
  );
  expect(
    isContentPrivilegedActionRequestSource({
      grantToken: 'grant-1',
      kind: 'background-auto-start',
    })
  ).toBe(true);
  expect(isContentPrivilegedActionRequestSource({ kind: 'background-auto-start' })).toBe(false);
  expect(isContentPrivilegedActionRequestSource(null)).toBe(false);
});

it('validates content privileged action activation and runtime tokens narrowly', () => {
  const activationKey = { expiresAtEpochMs: 1_000, keyId: 'key-1', secret: 'secret-1' };

  expect(isContentPrivilegedActionTrustedEventProof({ proofToken: 'proof-1' })).toBe(true);
  expect(isContentPrivilegedActionTrustedEventProof({ proofToken: 'proof-1', extra: true })).toBe(
    false
  );
  expect(isContentPrivilegedActionRuntimeToken({ runtimeToken: 'runtime-1' })).toBe(true);
  expect(isContentPrivilegedActionRuntimeToken({ runtimeToken: 'runtime-1', extra: true })).toBe(
    false
  );
  expect(isContentPrivilegedActionActivationKey(activationKey)).toBe(true);
  expect(isContentPrivilegedActionActivationKey({ keyId: 'key-1' })).toBe(false);
  expect(isContentPrivilegedActionActivationProof(activationKey)).toBe(true);
  expect(isContentPrivilegedActionActivationPurpose('recording-download')).toBe(true);
  expect(isContentPrivilegedActionActivationPurpose('trusted-content-event')).toBe(true);
  expect(isContentPrivilegedActionActivationPurpose('other')).toBe(false);
});
