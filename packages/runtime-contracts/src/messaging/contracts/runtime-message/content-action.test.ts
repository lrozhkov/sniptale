import { expectTypeOf, it } from 'vitest';
import { MessageType } from '../../message-types';
import type { ContentPrivilegedActionType } from '../../../protocol/content-privileged-action';
import type {
  RuntimeContentActionRequestByType,
  RuntimeContentActionResponseByType,
} from './content-action';

it('exposes content action request and response contract types', () => {
  expectTypeOf<
    RuntimeContentActionRequestByType[typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]
  >().toMatchTypeOf<{
    activationProof: { expiresAtEpochMs: number; keyId: string; secret: string };
    actionType: ContentPrivilegedActionType;
    requestId: string;
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN;
  }>();
  expectTypeOf<
    RuntimeContentActionRequestByType[typeof MessageType.TRIGGER_QUICK_ACTION]
  >().toMatchTypeOf<{
    type: typeof MessageType.TRIGGER_QUICK_ACTION;
    actionId: string;
    contentIntent?: { requestId: string; token: string };
    tabId?: number;
  }>();
  expectTypeOf<
    RuntimeContentActionResponseByType[typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]
  >().toMatchTypeOf<{
    activationKey?: { expiresAtEpochMs: number; keyId: string; secret: string };
  }>();
  expectTypeOf<
    RuntimeContentActionRequestByType[typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]
  >().toMatchTypeOf<{
    purpose: 'recording-download' | 'trusted-content-event';
    type: typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY;
  }>();
  expectTypeOf<
    RuntimeContentActionResponseByType[typeof MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]
  >().toMatchTypeOf<{
    contentIntent?: { requestId: string; token: string };
  }>();
});
