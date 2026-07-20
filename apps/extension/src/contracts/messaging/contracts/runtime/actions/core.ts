import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ProcessWithLLMMessage, ProcessWithLLMResponse } from '../../../llm';
import type { RequestLlmSessionMessage, RequestLlmSessionResponse } from '../../../llm';
import type {
  AiSettingsQueryMessage,
  AiSettingsQueryResponse,
  AiSettingsMutationMessage,
  AiSettingsMutationResponse,
} from '../../../ai-settings-runtime';
import type { AISecretUnlockMessage, AISecretUnlockResponse } from '../../../ai-secret-unlock';
import type { LocalDataErasureMessage, LocalDataErasureResponse } from '../../../privacy-erasure';
import type {
  ProcessScenarioEditorWithLLMMessage,
  ProcessScenarioEditorWithLLMResponse,
} from '../../../../ai/scenario';
import {
  createGuardParser,
  createZodParser,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  processScenarioEditorWithLlmMessageSchema,
  processScenarioEditorWithLlmResponseSchema,
  requestLlmSessionMessageSchema,
  requestLlmSessionResponseSchema,
  processWithLlmMessageSchema,
  processWithLlmResponseSchema,
} from '../../llm-schemas';
import {
  aiSettingsQueryMessageSchema,
  aiSettingsQueryResponseSchema,
  aiSettingsMutationMessageSchema,
  aiSettingsMutationResponseSchema,
} from '../../ai-settings-schemas';
import {
  aiSecretUnlockMessageSchema,
  aiSecretUnlockResponseSchema,
} from '../../ai-secret-unlock-schemas';
import {
  localDataErasureMessageSchema,
  localDataErasureResponseSchema,
} from '../../privacy-erasure-schemas';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isImageDataUrl,
  isNumber,
  isString,
} from '../../../validators/index';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { contentActionRuntimeContracts } from './content-action';
import { pageAccessRuntimeContracts } from './page-access';

function isContentRuntimeWakeupReason(value: unknown): value is 'pin-to-tab' | 'scenario' {
  return value === 'pin-to-tab' || value === 'scenario';
}

function isPageStorageErasureOperation(value: unknown): value is 'erase' | 'verify' {
  return value === 'erase' || value === 'verify';
}

export const runtimeActionCoreMessageContracts = {
  [MessageType.REQUEST_LLM_SESSION]: {
    parseRequest: createZodParser<RequestLlmSessionMessage>(
      'runtime REQUEST_LLM_SESSION message',
      requestLlmSessionMessageSchema
    ),
    parseResponse: createZodParser<RequestLlmSessionResponse>(
      'runtime REQUEST_LLM_SESSION response',
      requestLlmSessionResponseSchema
    ),
  },
  [MessageType.PROCESS_WITH_LLM]: {
    parseRequest: createZodParser<ProcessWithLLMMessage>(
      'runtime PROCESS_WITH_LLM message',
      processWithLlmMessageSchema
    ),
    parseResponse: createZodParser<ProcessWithLLMResponse>(
      'runtime PROCESS_WITH_LLM response',
      processWithLlmResponseSchema
    ),
  },
  [MessageType.PROCESS_SCENARIO_EDITOR_WITH_LLM]: {
    parseRequest: createZodParser<ProcessScenarioEditorWithLLMMessage>(
      'runtime PROCESS_SCENARIO_EDITOR_WITH_LLM message',
      processScenarioEditorWithLlmMessageSchema
    ),
    parseResponse: createZodParser<ProcessScenarioEditorWithLLMResponse>(
      'runtime PROCESS_SCENARIO_EDITOR_WITH_LLM response',
      processScenarioEditorWithLlmResponseSchema
    ),
  },
  [MessageType.AI_SETTINGS_QUERY]: {
    parseRequest: createZodParser<AiSettingsQueryMessage>(
      'runtime AI_SETTINGS_QUERY message',
      aiSettingsQueryMessageSchema
    ),
    parseResponse: createZodParser<AiSettingsQueryResponse>(
      'runtime AI_SETTINGS_QUERY response',
      aiSettingsQueryResponseSchema
    ),
  },
  [MessageType.AI_SETTINGS_MUTATION]: {
    parseRequest: createZodParser<AiSettingsMutationMessage>(
      'runtime AI_SETTINGS_MUTATION message',
      aiSettingsMutationMessageSchema
    ),
    parseResponse: createZodParser<AiSettingsMutationResponse>(
      'runtime AI_SETTINGS_MUTATION response',
      aiSettingsMutationResponseSchema
    ),
  },
  [MessageType.AI_SECRET_UNLOCK]: {
    parseRequest: createZodParser<AISecretUnlockMessage>(
      'runtime AI_SECRET_UNLOCK message',
      aiSecretUnlockMessageSchema
    ),
    parseResponse: createZodParser<AISecretUnlockResponse>(
      'runtime AI_SECRET_UNLOCK response',
      aiSecretUnlockResponseSchema
    ),
  },
  [MessageType.PAGE_ACCESS]: pageAccessRuntimeContracts,
  [MessageType.CONTENT_RUNTIME_WAKEUP]: {
    parseRequest: createGuardParser(
      'runtime CONTENT_RUNTIME_WAKEUP message',
      createMessageGuard({
        type: MessageType.CONTENT_RUNTIME_WAKEUP,
      })
    ),
    parseResponse: createGuardParser(
      'runtime CONTENT_RUNTIME_WAKEUP response',
      createRuntimeResponseGuard({
        optional: { reason: isContentRuntimeWakeupReason, restored: isBoolean },
      })
    ),
  },
  [MessageType.ERASE_LOCAL_EXTENSION_DATA]: {
    parseRequest: createZodParser<LocalDataErasureMessage>(
      'runtime ERASE_LOCAL_EXTENSION_DATA message',
      localDataErasureMessageSchema
    ),
    parseResponse: createZodParser<LocalDataErasureResponse>(
      'runtime ERASE_LOCAL_EXTENSION_DATA response',
      localDataErasureResponseSchema
    ),
  },
  [MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE,
        required: {
          capabilityToken: isString,
          operation: isPageStorageErasureOperation,
          preservePreferences: isBoolean,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_PRIVACY_ERASURE_PAGE_STORAGE response',
      createRuntimeResponseGuard({
        optional: { empty: isBoolean, removedCount: isNumber },
      })
    ),
  },
  [MessageType.EXPORT_CAPTURE_FULL_PAGE]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_CAPTURE_FULL_PAGE message',
      createMessageGuard({
        type: MessageType.EXPORT_CAPTURE_FULL_PAGE,
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_CAPTURE_FULL_PAGE response',
      createRuntimeResponseGuard({ optional: { dataUrl: isString } })
    ),
  },
  ...contentActionRuntimeContracts,
  [MessageType.OPEN_EDITOR_WITH_IMAGE]: {
    parseRequest: createGuardParser(
      'runtime OPEN_EDITOR_WITH_IMAGE message',
      createMessageGuard({
        type: MessageType.OPEN_EDITOR_WITH_IMAGE,
        required: { dataUrl: isImageDataUrl },
        optional: {
          contentIntent: isContentPrivilegedActionCapability,
          title: isString,
          url: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OPEN_EDITOR_WITH_IMAGE response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  [MessageType.TRIGGER_QUICK_ACTION]: {
    parseRequest: createGuardParser(
      'runtime TRIGGER_QUICK_ACTION message',
      createMessageGuard({
        type: MessageType.TRIGGER_QUICK_ACTION,
        required: { actionId: isString },
        optional: { contentIntent: isContentPrivilegedActionCapability, tabId: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'runtime TRIGGER_QUICK_ACTION response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
