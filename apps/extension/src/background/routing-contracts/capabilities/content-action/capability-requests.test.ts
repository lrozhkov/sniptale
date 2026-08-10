import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseContentPrivilegedActionActivationKeyRequest,
  parseContentPrivilegedActionCapabilityRequest,
  parseContentPrivilegedActionProofRequest,
  parseContentPrivilegedActionRuntimeTokenRequest,
} from './capability-requests';

it('rejects malformed authority requests and preserves explicit library intent', () => {
  expect(parseContentPrivilegedActionActivationKeyRequest(null)).toBeNull();
  expect(parseContentPrivilegedActionProofRequest(null)).toBeNull();
  expect(parseContentPrivilegedActionRuntimeTokenRequest(null)).toBeNull();
  expect(
    parseContentPrivilegedActionCapabilityRequest({
      actionType: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
      libraryDestinationRequested: false,
      requestId: 'request-1',
      source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
    })
  ).toBeNull();
  expect(
    parseContentPrivilegedActionCapabilityRequest({
      actionType: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
      libraryDestinationRequested: true,
      requestId: 'request-1',
      source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
      type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
    })
  ).toEqual({
    actionType: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    libraryDestinationRequested: true,
    requestId: 'request-1',
    source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  });
});
