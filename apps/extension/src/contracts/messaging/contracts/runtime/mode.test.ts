import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimeModeMessageContracts } from './mode';

describe('runtimeModeMessageContracts', () => {
  it('accepts routed screenshot mode async ack responses', () => {
    expect(
      runtimeModeMessageContracts[MessageType.ENABLE_SCREENSHOT_MODE].parseResponse({
        success: true,
        result: 'accepted',
      })
    ).toEqual({
      success: true,
      result: 'accepted',
    });
  });

  it('accepts tab-scoped screenshot mode status responses', () => {
    expect(
      runtimeModeMessageContracts[MessageType.SCREENSHOT_MODE_STATUS].parseResponse({
        success: true,
        documentId: 'content-document-7',
        enabled: true,
        supported: true,
        tabId: 7,
        unsupportedReason: null,
        viewport: null,
      })
    ).toEqual({
      success: true,
      documentId: 'content-document-7',
      enabled: true,
      supported: true,
      tabId: 7,
      unsupportedReason: null,
      viewport: null,
    });
  });
});
