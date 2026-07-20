import type {
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionActivationPurpose,
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';

export type ContentActionIntentMessage =
  | {
      purpose: ContentPrivilegedActionActivationPurpose;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
    }
  | {
      activationProof: ContentPrivilegedActionActivationKey;
      actionType: ContentPrivilegedActionType;
      requestId: string;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
    }
  | {
      actionType: ContentPrivilegedActionType;
      requestId: string;
      runtimeToken: string;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
    }
  | {
      actionType: ContentPrivilegedActionType;
      requestId: string;
      source: ContentPrivilegedActionRequestSource;
      type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
    };

type ContentActionIntentResponse =
  | {
      activationKey?: unknown;
      contentIntent?: unknown;
      error?: string | undefined;
      runtimeToken?: unknown;
      success?: boolean;
      trustedEventProof?: unknown;
    }
  | null
  | undefined;

export type ContentActionIntentSendMessage = (
  message: ContentActionIntentMessage
) => Promise<ContentActionIntentResponse>;
