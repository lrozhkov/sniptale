import { expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimePageLaunchContracts } from './page-launch';
const type = MessageType.PAGE_LAUNCH_PREFERENCES;
it('admits only bounded corner commands and committed corner responses', () => {
  const contract = runtimePageLaunchContracts[type];
  expect(contract.parseRequest({ type, corner: 'top-left' })).toEqual({ type, corner: 'top-left' });
  expect(contract.parseResponse({ success: true, corner: 'bottom-right' })).toEqual({
    success: true,
    corner: 'bottom-right',
  });
  expect(contract.parseResponse({ success: false, error: 'refused' })).toEqual({
    success: false,
    error: 'refused',
  });
  for (const value of [undefined, 'center', 1]) {
    expect(() => contract.parseRequest({ type, corner: value })).toThrow();
    expect(() => contract.parseResponse({ success: true, corner: value })).toThrow();
  }
  expect(() => contract.parseRequest({ type: 'OTHER', corner: 'top-left' })).toThrow();
});
