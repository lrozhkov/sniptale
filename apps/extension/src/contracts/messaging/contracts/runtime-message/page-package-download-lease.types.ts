import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export type PagePackageDownloadAssetRefPayload = {
  assetId: string;
  createdAt: number;
  location: { kind: 'opfs'; objectKey: string };
  mimeType: string;
  sha256: string | null;
  size: number;
};

export type RuntimePagePackageDownloadLeaseRequestByType = {
  [MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    type: typeof MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE;
    capabilityToken: string;
    downloadOperationId: string;
    filename: string;
    reference: PagePackageDownloadAssetRefPayload;
  };
  [MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    type: typeof MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE;
    capabilityToken: string;
    downloadOperationId: string;
    leaseId: string;
  };
  [MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE]: {
    type: typeof MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE;
    capabilityToken: string;
    downloadOperationId: string;
    leaseId: string;
  };
};

export type RuntimePagePackageDownloadLeaseResponseByType = {
  [MessageType.OFFSCREEN_CREATE_PAGE_PACKAGE_DOWNLOAD_LEASE]: RuntimeMessageResponse<{
    leaseId: string;
    result: 'leased';
    url: string;
  }>;
  [MessageType.OFFSCREEN_CONFIRM_PAGE_PACKAGE_DOWNLOAD_LEASE]: RuntimeMessageResponse<{
    result: 'confirmed' | 'stale';
  }>;
  [MessageType.OFFSCREEN_RELEASE_PAGE_PACKAGE_DOWNLOAD_LEASE]: RuntimeMessageResponse<{
    result: 'released' | 'stale';
  }>;
};
