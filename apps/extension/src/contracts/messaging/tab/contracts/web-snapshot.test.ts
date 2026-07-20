import { describe, expect, it } from 'vitest';

import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { tabWebSnapshotMessageContracts } from './web-snapshot';

describe('tabWebSnapshotMessageContracts', () => {
  it('accepts web snapshot warning responses from content tabs', () => {
    expect(
      tabWebSnapshotMessageContracts[MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT].parseResponse({
        assetId: 'snapshot-1',
        success: true,
        warnings: ['Asset skipped'],
      })
    ).toEqual({
      assetId: 'snapshot-1',
      success: true,
      warnings: ['Asset skipped'],
    });
  });
});
