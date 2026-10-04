import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { MessageContractError } from '@sniptale/runtime-contracts/messaging/parsers/utils';

import { contentActionRuntimeContracts } from './content-action';

function createCapabilityRequest() {
  return {
    actionType: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
    requestId: 'request-1',
    source: { kind: 'trusted-content-event-proof', proofToken: 'proof-1' },
    type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
  };
}

it('parses capability requests with the optional library-destination marker', () => {
  const contract =
    contentActionRuntimeContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY];
  expect(contract.parseRequest(createCapabilityRequest())).toEqual(createCapabilityRequest());
  expect(
    contract.parseRequest({ ...createCapabilityRequest(), libraryDestinationRequested: true })
  ).toEqual({ ...createCapabilityRequest(), libraryDestinationRequested: true });
});

it.each([false, 'true', 1, null, {}])(
  'rejects capability requests with malformed libraryDestinationRequested=%s',
  (libraryDestinationRequested) => {
    const contract =
      contentActionRuntimeContracts[MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY];
    expect(() =>
      contract.parseRequest({ ...createCapabilityRequest(), libraryDestinationRequested })
    ).toThrow(MessageContractError);
  }
);
