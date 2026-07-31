import { expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeActionExportMessageContracts } from './export';

const capability = {
  tabRouteCapabilityToken: 'capability-token',
  tabRouteRequestId: 'route-request',
};

it('parses popup export launch-intent requests and authoritative nullable results narrowly', () => {
  const contract =
    runtimeActionExportMessageContracts[MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT];
  const request = {
    ...capability,
    tabId: 7,
    type: MessageType.CONSUME_POPUP_EXPORT_LAUNCH_INTENT,
  } as const;

  expect(contract.parseRequest(request)).toEqual(request);
  expect(contract.parseResponse({ page: 'export', success: true })).toEqual({
    page: 'export',
    success: true,
  });
  expect(contract.parseResponse({ page: null, success: true })).toEqual({
    page: null,
    success: true,
  });
  expect(() => contract.parseResponse({ page: 'home', success: true })).toThrow();
  expect(() => contract.parseResponse({ success: true })).toThrow();
});
