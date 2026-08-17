import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
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
  isRecord,
  isString,
} from '../../../validators/index';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import { contentActionRuntimeContracts } from './content-action';
import { pageAccessRuntimeContracts } from './page-access';
import { isScreenshotImageFormat } from '@sniptale/runtime-contracts/capture/action';
import type { SettingsTransferMessage } from '../../../../settings-transfer';
import { SETTINGS_TRANSFER_MAX_BYTES } from '../../../../settings-transfer';
import { isSettingsTransferResponse } from './settings-transfer-response-guard';

function isSettingsTransferMessage(value: unknown): value is SettingsTransferMessage {
  if (!isRecord(value) || value['type'] !== MessageType.SETTINGS_TRANSFER) return false;
  const operation = value['operation'];
  if (operation === 'read-export-tree') return Object.keys(value).length === 2;
  if (operation === 'build-export-package') {
    return (
      Object.keys(value).length === 4 &&
      (value['exportKind'] === 'backup' || value['exportKind'] === 'selective') &&
      isStringArray(value['selectedNodeIds'])
    );
  }
  if (operation === 'inspect-import') {
    return Object.keys(value).length === 3 && isBoundedSettingsTransferText(value['fileText']);
  }
  if (operation !== 'commit-import') return false;
  return (
    Object.keys(value).length === 8 &&
    isBoundedSettingsTransferText(value['fileText']) &&
    (value['strategy'] === 'safe-merge' ||
      value['strategy'] === 'overwrite-matching' ||
      value['strategy'] === 'exact-restore') &&
    isStringArray(value['selectedNodeIds']) &&
    isString(value['fingerprint']) &&
    value['fingerprint'].length === 64 &&
    isBoolean(value['destructiveConfirmed']) &&
    isRecord(value['decisions']) &&
    Object.keys(value['decisions']).length <= 50_000 &&
    Object.keys(value['decisions']).every(isSettingsTransferNodeId) &&
    Object.values(value['decisions']).every(
      (decision) =>
        decision === 'keep-local' || decision === 'use-imported' || decision === 'import-as-copy'
    )
  );
}

function isBoundedSettingsTransferText(value: unknown): value is string {
  return (
    isString(value) && new TextEncoder().encode(value).byteLength <= SETTINGS_TRANSFER_MAX_BYTES
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 50_000 && value.every(isSettingsTransferNodeId);
}

function isSettingsTransferNodeId(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 512;
}

function isAiSettingsNavigationSection(value: unknown): value is 'ai-connections' | 'ai-prompts' {
  return value === 'ai-connections' || value === 'ai-prompts';
}

function isContentRuntimeWakeupReason(value: unknown): value is 'pin-to-tab' | 'scenario' {
  return value === 'pin-to-tab' || value === 'scenario';
}

function isAnnotationForkSessionPayload(value: unknown): value is string {
  return isString(value) && value.length <= 500_000;
}

type AnnotationForkSessionMessage =
  | { type: typeof MessageType.ANNOTATION_FORK_SESSION; operation: 'read' }
  | {
      type: typeof MessageType.ANNOTATION_FORK_SESSION;
      operation: 'clear' | 'write';
      expectedRevision: number;
      payload?: string;
    };

function isAnnotationForkSessionMessage(value: unknown): value is AnnotationForkSessionMessage {
  if (!isRecord(value) || value['type'] !== MessageType.ANNOTATION_FORK_SESSION) return false;
  if (value['operation'] === 'read') return Object.keys(value).length === 2;
  if (value['operation'] !== 'write' && value['operation'] !== 'clear') return false;
  if (!isNumber(value['expectedRevision']) || !Number.isSafeInteger(value['expectedRevision'])) {
    return false;
  }
  return value['operation'] === 'write'
    ? Object.keys(value).length === 4 && isAnnotationForkSessionPayload(value['payload'])
    : Object.keys(value).length === 3;
}

function isEditableAggregateRef(value: unknown): value is {
  id: string;
  kind: 'image' | 'scenario' | 'video-project';
} {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    isString(value['id']) &&
    value['id'].length > 0 &&
    value['id'].length <= 256 &&
    (value['kind'] === 'image' || value['kind'] === 'scenario' || value['kind'] === 'video-project')
  );
}

type ContentRuntimeWakeupResponse = RuntimeMessageResponse<{
  pinToTab: boolean;
  pinToTabAvailable: boolean;
  reason?: 'pin-to-tab' | 'scenario';
  restored?: boolean;
  toolbarVisible?: boolean;
}>;

const isContentRuntimeWakeupResponseEnvelope =
  createRuntimeResponseGuard<ContentRuntimeWakeupResponse>({
    optional: {
      pinToTab: isBoolean,
      pinToTabAvailable: isBoolean,
      reason: isContentRuntimeWakeupReason,
      restored: isBoolean,
      toolbarVisible: isBoolean,
    },
  });

function isContentRuntimeWakeupResponse(input: unknown): input is ContentRuntimeWakeupResponse {
  if (!isContentRuntimeWakeupResponseEnvelope(input) || !isRecord(input)) {
    return false;
  }

  return (
    input['success'] !== true ||
    (isBoolean(input['pinToTab']) && isBoolean(input['pinToTabAvailable']))
  );
}

function isPageStorageErasureOperation(value: unknown): value is 'erase' | 'verify' {
  return value === 'erase' || value === 'verify';
}

function isFrameAnnotationRasterReference(value: unknown): value is {
  inputSha256: string;
  jobId: string;
  revision: number;
} {
  return (
    isRecord(value) &&
    isString(value['jobId']) &&
    isString(value['inputSha256']) &&
    isNumber(value['revision']) &&
    Number.isSafeInteger(value['revision']) &&
    value['revision'] >= 0
  );
}

function isFrameAnnotationRasterLeaseId(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 128;
}

function isDesktopCaptureCorrelationId(value: unknown): value is string {
  return isString(value) && value.length > 0 && value.length <= 128;
}

function isPngImageDataUrl(value: unknown): value is string {
  return isImageDataUrl(value) && value.startsWith('data:image/png');
}

const isDesktopClipboardResponseEnvelope = createRuntimeResponseGuard<
  RuntimeMessageResponse<{ result: 'copied' }>
>({ optional: { result: (value) => value === 'copied' } });

function isDesktopClipboardResponse(
  value: unknown
): value is RuntimeMessageResponse<{ result: 'copied' }> {
  return (
    isDesktopClipboardResponseEnvelope(value) &&
    isRecord(value) &&
    (value['success'] !== true || value['result'] === 'copied')
  );
}

const isDesktopFrameAckResponseEnvelope = createRuntimeResponseGuard<
  RuntimeMessageResponse<{ result: 'accepted' }>
>({
  optional: { result: (value) => value === 'accepted' },
});
function isDesktopFrameAckResponse(
  value: unknown
): value is RuntimeMessageResponse<{ result: 'accepted' }> {
  return (
    isDesktopFrameAckResponseEnvelope(value) &&
    isRecord(value) &&
    (value['success'] !== true || value['result'] === 'accepted')
  );
}

const isDesktopFrameCaptureResponseEnvelope = createRuntimeResponseGuard<
  RuntimeMessageResponse<{
    result: 'captured';
    dataUrl: string;
    width: number;
    height: number;
  }>
>({
  optional: {
    result: (value) => value === 'captured',
    dataUrl: isImageDataUrl,
    width: (value) => isNumber(value) && Number.isSafeInteger(value) && value > 0,
    height: (value) => isNumber(value) && Number.isSafeInteger(value) && value > 0,
  },
});
function isDesktopFrameCaptureResponse(value: unknown): value is RuntimeMessageResponse<{
  result: 'captured';
  dataUrl: string;
  width: number;
  height: number;
}> {
  return (
    isDesktopFrameCaptureResponseEnvelope(value) &&
    isRecord(value) &&
    (value['success'] !== true ||
      (value['result'] === 'captured' &&
        isImageDataUrl(value['dataUrl']) &&
        isNumber(value['width']) &&
        isNumber(value['height'])))
  );
}

const isFrameAnnotationRasterResponseEnvelope = createRuntimeResponseGuard<
  RuntimeMessageResponse<{ result: string }>
>({ optional: { result: isString } });

function isFrameAnnotationRasterResponse(
  value: unknown
): value is RuntimeMessageResponse<{ result: string }> {
  return (
    isFrameAnnotationRasterResponseEnvelope(value) &&
    isRecord(value) &&
    (value['success'] !== true || isString(value['result']))
  );
}

export const runtimeActionCoreMessageContracts = {
  [MessageType.SETTINGS_TRANSFER]: {
    parseRequest: createGuardParser('runtime SETTINGS_TRANSFER message', isSettingsTransferMessage),
    parseResponse: createGuardParser(
      'runtime SETTINGS_TRANSFER response',
      isSettingsTransferResponse
    ),
  },
  [MessageType.AI_SETTINGS_NAVIGATION]: {
    parseRequest: createGuardParser(
      'runtime AI_SETTINGS_NAVIGATION message',
      createMessageGuard({
        type: MessageType.AI_SETTINGS_NAVIGATION,
        required: { section: isAiSettingsNavigationSection },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime AI_SETTINGS_NAVIGATION response',
      createRuntimeResponseGuard({ optional: { result: (value) => value === 'accepted' } })
    ),
  },
  [MessageType.FRAME_ANNOTATION_RASTERIZE]: {
    parseRequest: createGuardParser(
      'runtime FRAME_ANNOTATION_RASTERIZE message',
      (
        value
      ): value is
        | {
            type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
            operation: 'prepare';
            leaseId: string;
          }
        | {
            type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
            operation: 'cancel';
            leaseId: string;
          }
        | {
            type: typeof MessageType.FRAME_ANNOTATION_RASTERIZE;
            operation: 'rasterize';
            reference: { inputSha256: string; jobId: string; revision: number };
          } =>
        isRecord(value) &&
        value['type'] === MessageType.FRAME_ANNOTATION_RASTERIZE &&
        ((value['operation'] === 'prepare' && isFrameAnnotationRasterLeaseId(value['leaseId'])) ||
          (value['operation'] === 'cancel' && isFrameAnnotationRasterLeaseId(value['leaseId'])) ||
          (value['operation'] === 'rasterize' &&
            isFrameAnnotationRasterReference(value['reference'])))
    ),
    parseResponse: createGuardParser(
      'runtime FRAME_ANNOTATION_RASTERIZE response',
      isFrameAnnotationRasterResponse
    ),
  },
  [MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_FRAME_ANNOTATION_RASTERIZE message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_FRAME_ANNOTATION_RASTERIZE,
        required: { capabilityToken: isString, reference: isFrameAnnotationRasterReference },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_FRAME_ANNOTATION_RASTERIZE response',
      isFrameAnnotationRasterResponse
    ),
  },
  [MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_WRITE_IMAGE_CLIPBOARD message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_WRITE_IMAGE_CLIPBOARD,
        required: {
          capabilityToken: isString,
          requestId: isDesktopCaptureCorrelationId,
          dataUrl: isPngImageDataUrl,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_WRITE_IMAGE_CLIPBOARD response',
      isDesktopClipboardResponse
    ),
  },
  [MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_PREPARE_DESKTOP_FRAME message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_PREPARE_DESKTOP_FRAME,
        required: { capabilityToken: isString, requestId: isDesktopCaptureCorrelationId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_PREPARE_DESKTOP_FRAME response',
      isDesktopFrameAckResponse
    ),
  },
  [MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_CAPTURE_DESKTOP_FRAME message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_CAPTURE_DESKTOP_FRAME,
        required: {
          capabilityToken: isString,
          requestId: isDesktopCaptureCorrelationId,
          streamId: (value) => isString(value) && value.length > 0 && value.length <= 4096,
          imageFormat: isScreenshotImageFormat,
          imageQuality: (value) =>
            isNumber(value) && Number.isFinite(value) && value >= 1 && value <= 100,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_CAPTURE_DESKTOP_FRAME response',
      isDesktopFrameCaptureResponse
    ),
  },
  [MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_CANCEL_DESKTOP_FRAME message',
      createMessageGuard({
        type: MessageType.OFFSCREEN_CANCEL_DESKTOP_FRAME,
        required: { capabilityToken: isString, requestId: isDesktopCaptureCorrelationId },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_CANCEL_DESKTOP_FRAME response',
      isDesktopFrameAckResponse
    ),
  },
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
        optional: {
          contentIntent: isContentPrivilegedActionCapability,
          pinToTab: isBoolean,
          toolbarVisible: isBoolean,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CONTENT_RUNTIME_WAKEUP response',
      isContentRuntimeWakeupResponse
    ),
  },
  [MessageType.ANNOTATION_FORK_SESSION]: {
    parseRequest: createGuardParser(
      'runtime ANNOTATION_FORK_SESSION message',
      isAnnotationForkSessionMessage
    ),
    parseResponse: createGuardParser(
      'runtime ANNOTATION_FORK_SESSION response',
      createRuntimeResponseGuard({
        optional: {
          payload: isAnnotationForkSessionPayload,
          result: (value) =>
            value === 'read' ||
            value === 'written' ||
            value === 'cleared' ||
            value === 'stale' ||
            value === 'stale-document',
          revision: isNumber,
        },
      })
    ),
  },
  [MessageType.PROMOTE_AGGREGATE_TO_LIBRARY]: {
    parseRequest: createGuardParser(
      'runtime PROMOTE_AGGREGATE_TO_LIBRARY message',
      createMessageGuard({
        type: MessageType.PROMOTE_AGGREGATE_TO_LIBRARY,
        required: { aggregate: isEditableAggregateRef },
      })
    ),
    parseResponse: createGuardParser(
      'runtime PROMOTE_AGGREGATE_TO_LIBRARY response',
      createRuntimeResponseGuard({ optional: { result: (value) => value === 'promoted' } })
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
        required: { exportRunId: isString },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_CAPTURE_FULL_PAGE response',
      createRuntimeResponseGuard({
        optional: {
          dataUrl: isString,
          downscaled: isBoolean,
          frozenExtentWarning: isBoolean,
        },
      })
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
          assetId: isString,
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
} satisfies PartialRuntimeRegistry;
