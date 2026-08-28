import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export type RuntimePagePackageStagingRequestByType = {
  [MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK]: {
    base64: string;
    final: boolean;
    jobId: string;
    ordinal: number;
    sequence: number;
    stagedBlobId: string;
    type: typeof MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK;
  };
};

export type RuntimePagePackageStagingResponseByType = {
  [MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK]: RuntimeMessageResponse<{
    complete?: boolean;
    stagedBlobId?: string;
  }>;
};
