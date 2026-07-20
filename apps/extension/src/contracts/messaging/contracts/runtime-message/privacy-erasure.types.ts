import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { LocalDataErasureMessage, LocalDataErasureResponse } from '../../privacy-erasure';

export type RuntimePrivacyErasureRequestByType = {
  [MessageType.ERASE_LOCAL_EXTENSION_DATA]: LocalDataErasureMessage;
  [MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE]: {
    type: typeof MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE;
    capabilityToken: string;
    operation: 'erase' | 'verify';
    preservePreferences: boolean;
  };
};

export type RuntimePrivacyErasureResponseByType = {
  [MessageType.ERASE_LOCAL_EXTENSION_DATA]: LocalDataErasureResponse;
  [MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE]: RuntimeMessageResponse<{
    empty: boolean;
    removedCount?: number;
  }>;
};
