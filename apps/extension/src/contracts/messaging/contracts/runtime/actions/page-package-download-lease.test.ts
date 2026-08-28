import { describe, expect, it } from 'vitest';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  parseRuntimeRequestMessage,
  parseRuntimeResponseForMessage,
} from '../../../parsers/boundary';

const reference = {
  assetId: 'asset-1',
  createdAt: 1,
  location: { kind: 'opfs' as const, objectKey: 'objects/asset-1' },
  mimeType: 'application/vnd.sniptale.page-package+zip',
  sha256: null,
  size: 10,
};

describe('Page Package offscreen download lease contracts', () => {
  it('accepts exact create, confirm, and release messages and responses', () => {
    expect(
      parseRuntimeRequestMessage({
        type: MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
        capabilityToken: 'capability',
        downloadOperationId: 'operation-1',
        filename: 'page.sniptale-page-package.zip',
        reference,
      })
    ).toEqual(expect.objectContaining({ downloadOperationId: 'operation-1', reference }));
    expect(
      parseRuntimeResponseForMessage(MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE, {
        success: true,
        result: 'leased',
        leaseId: 'lease-1',
        url: 'blob:lease-1',
      })
    ).toEqual(expect.objectContaining({ result: 'leased', leaseId: 'lease-1' }));
    for (const type of [
      MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE,
      MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE,
    ] as const) {
      expect(
        parseRuntimeRequestMessage({
          type,
          capabilityToken: 'capability',
          downloadOperationId: 'operation-1',
          leaseId: 'lease-1',
        })
      ).toEqual(expect.objectContaining({ type, leaseId: 'lease-1' }));
    }
  });

  it('rejects widened or malformed asset references', () => {
    expect(() =>
      parseRuntimeRequestMessage({
        type: MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE,
        capabilityToken: 'capability',
        downloadOperationId: 'operation-1',
        filename: 'page.zip',
        reference: { ...reference, unexpected: true },
      })
    ).toThrow();
  });
});
