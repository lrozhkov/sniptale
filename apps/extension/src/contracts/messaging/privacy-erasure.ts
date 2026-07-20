import type {
  LocalExtensionDataErasureOptions,
  LocalExtensionDataErasureResult,
} from '@sniptale/runtime-contracts/privacy-erasure/types';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export interface LocalDataErasureMessage extends LocalExtensionDataErasureOptions {
  type: typeof MessageType.ERASE_LOCAL_EXTENSION_DATA;
}

export interface LocalDataErasureResponse {
  error?: string | undefined;
  result?: LocalExtensionDataErasureResult | undefined;
  success: boolean;
}
