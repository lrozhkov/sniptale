import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabUiMessageContracts } from './ui';

it('accepts an empty delivery response because toolbar state confirms the postcondition', () => {
  const contract = tabUiMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE];
  expect(contract.parseResponse({ success: true })).toEqual({ success: true });
  expect(contract.parseResponse(undefined)).toBeUndefined();
  expect(() => contract.parseResponse({ success: true, unexpected: true })).toThrow(
    /ENABLE_SCREENSHOT_MODE/
  );
});
