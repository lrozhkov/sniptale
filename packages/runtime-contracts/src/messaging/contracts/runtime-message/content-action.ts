import type { MessageType } from '../../message-types';
import type { RuntimeMessageResponse } from '../response';
import type {
  ContentPrivilegedActionCapability,
  ContentPrivilegedActionActivationKey,
  ContentPrivilegedActionActivationProof,
  ContentPrivilegedActionActivationPurpose,
  ContentPrivilegedActionRequestSource,
  ContentPrivilegedActionRuntimeToken,
  ContentPrivilegedActionTrustedEventProof,
  ContentPrivilegedActionType,
} from '../../../protocol/content-privileged-action';

type RuntimeEmptyResponse = RuntimeMessageResponse<Record<string, never>>;

export type RuntimeContentActionRequestByType = {
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
    purpose: ContentPrivilegedActionActivationPurpose;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
    activationProof: ContentPrivilegedActionActivationProof;
    actionType: ContentPrivilegedActionType;
    requestId: string;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF;
    actionType: ContentPrivilegedActionType;
    requestId: string;
    runtimeToken: string;
  };
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: {
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY;
    actionType: ContentPrivilegedActionType;
    requestId: string;
    source: ContentPrivilegedActionRequestSource;
  };
  [MessageType.OPEN_EDITOR_WITH_IMAGE]: {
    type: typeof MessageType.OPEN_EDITOR_WITH_IMAGE;
    dataUrl: string;
    contentIntent?: ContentPrivilegedActionCapability;
  };
  [MessageType.TRIGGER_QUICK_ACTION]: {
    type: typeof MessageType.TRIGGER_QUICK_ACTION;
    actionId: string;
    contentIntent?: ContentPrivilegedActionCapability;
    tabId?: number;
  };
};

export type RuntimeContentActionResponseByType = {
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: RuntimeMessageResponse<{
    activationKey?: ContentPrivilegedActionActivationKey;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: RuntimeMessageResponse<{
    runtimeToken?: ContentPrivilegedActionRuntimeToken;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: RuntimeMessageResponse<{
    trustedEventProof?: ContentPrivilegedActionTrustedEventProof;
  }>;
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: RuntimeMessageResponse<{
    contentIntent?: ContentPrivilegedActionCapability;
  }>;
  [MessageType.OPEN_EDITOR_WITH_IMAGE]: RuntimeEmptyResponse;
  [MessageType.TRIGGER_QUICK_ACTION]: RuntimeMessageResponse<{ result?: string }>;
};
