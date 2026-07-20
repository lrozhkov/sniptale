import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isString,
} from '../../../validators/index';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  isContentPrivilegedActionActivationKey,
  isContentPrivilegedActionActivationProof,
  isContentPrivilegedActionActivationPurpose,
  isContentPrivilegedActionCapability,
  isContentPrivilegedActionRequestSource,
  isContentPrivilegedActionRuntimeToken,
  isContentPrivilegedActionTrustedEventProof,
  isContentPrivilegedActionType,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

export const contentActionRuntimeContracts = {
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY,
        required: {
          actionType: isContentPrivilegedActionType,
          requestId: isString,
          source: isContentPrivilegedActionRequestSource,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_CAPABILITY response',
      createRuntimeResponseGuard({
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY,
        required: { purpose: isContentPrivilegedActionActivationPurpose },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_ACTIVATION_KEY response',
      createRuntimeResponseGuard({
        optional: { activationKey: isContentPrivilegedActionActivationKey },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN,
        required: {
          activationProof: isContentPrivilegedActionActivationProof,
          actionType: isContentPrivilegedActionType,
          requestId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_RUNTIME_TOKEN response',
      createRuntimeResponseGuard({
        optional: { runtimeToken: isContentPrivilegedActionRuntimeToken },
      })
    ),
  },
  [MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF message',
      createMessageGuard({
        type: MessageType.REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF,
        required: {
          actionType: isContentPrivilegedActionType,
          requestId: isString,
          runtimeToken: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_CONTENT_PRIVILEGED_ACTION_PROOF response',
      createRuntimeResponseGuard({
        optional: { trustedEventProof: isContentPrivilegedActionTrustedEventProof },
      })
    ),
  },
} satisfies PartialRuntimeRegistry;
