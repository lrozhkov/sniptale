import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../../runtime-message/index';
import {
  MAX_RECORDING_SIDECAR_TEXT_BYTES,
  isBoundedUtf8Text,
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import { runtimeVideoExportCapabilityContracts } from './export-capabilities';
import { runtimeVideoExportLifecycleContracts } from './export-lifecycle';
import { runtimeVideoOffscreenProjectExportMessageContracts } from './offscreen/project-export';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isProjectExportInputReference,
  isString,
  isVideoProjectExportSettings,
  isViewportRegion,
} from '../../../validators/index';

const V = VideoMessageType;

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

function isRecordingSidecarContent(value: unknown): value is string {
  return isBoundedUtf8Text(value, MAX_RECORDING_SIDECAR_TEXT_BYTES);
}

export const runtimeVideoExportMessageContracts = {
  [V.START_PROJECT_EXPORT]: {
    parseRequest: createGuardParser(
      'runtime START_PROJECT_EXPORT message',
      createMessageGuard({
        type: V.START_PROJECT_EXPORT,
        required: {
          capabilityToken: isString,
          input: isProjectExportInputReference,
          jobId: isString,
          settings: isVideoProjectExportSettings,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime START_PROJECT_EXPORT response',
      createRuntimeResponseGuard({
        optional: { capabilityToken: isString, jobId: isString, ownerDocumentId: isString },
      })
    ),
  },
  [V.CANCEL_PROJECT_EXPORT]: {
    parseRequest: createGuardParser(
      'runtime CANCEL_PROJECT_EXPORT message',
      createMessageGuard({
        type: V.CANCEL_PROJECT_EXPORT,
        required: { capabilityToken: isString, jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime CANCEL_PROJECT_EXPORT response',
      createRuntimeResponseGuard({ optional: { jobId: isString, result: isString } })
    ),
  },
  ...runtimeVideoOffscreenProjectExportMessageContracts,
  ...runtimeVideoExportLifecycleContracts,
  [V.DIAGNOSTIC_EVENT_FROM_CS]: {
    parseRequest: createGuardParser(
      'runtime DIAGNOSTIC_EVENT_FROM_CS message',
      createMessageGuard({
        type: V.DIAGNOSTIC_EVENT_FROM_CS,
        optional: {
          recordingId: isString,
          level: isString,
          event: isString,
          payload: (_value): _value is unknown => true,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DIAGNOSTIC_EVENT_FROM_CS response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  [V.DOWNLOAD_RECORDING]: {
    parseRequest: createGuardParser(
      'runtime DOWNLOAD_RECORDING message',
      createMessageGuard({
        type: V.DOWNLOAD_RECORDING,
        required: { filename: isString, recordingId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DOWNLOAD_RECORDING response',
      createRuntimeResponseGuard({ optional: { downloadId: isNumber } })
    ),
  },
  [V.DOWNLOAD_RECORDING_SIDECAR]: {
    parseRequest: createGuardParser(
      'runtime DOWNLOAD_RECORDING_SIDECAR message',
      createMessageGuard({
        type: V.DOWNLOAD_RECORDING_SIDECAR,
        required: {
          content: isRecordingSidecarContent,
          filename: isSafeDownloadFilename,
          mimeType: isSafeDownloadMimeType,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime DOWNLOAD_RECORDING_SIDECAR response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { downloadId: isNumber } })
    ),
  },
  [V.VIDEO_SAVED_TO_IDB]: {
    parseRequest: createGuardParser(
      'runtime VIDEO_SAVED_TO_IDB message',
      createMessageGuard({
        type: V.VIDEO_SAVED_TO_IDB,
        required: { recordingId: isString },
        optional: { filename: isString, projectId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime VIDEO_SAVED_TO_IDB response',
      createRuntimeResponseGuard({ allowUndefined: true, optional: { result: isString } })
    ),
  },
  KEEP_ALIVE: {
    parseRequest: createGuardParser(
      'runtime KEEP_ALIVE message',
      createMessageGuard({ type: 'KEEP_ALIVE', optional: { tabId: isNumber } })
    ),
    parseResponse: createGuardParser(
      'runtime KEEP_ALIVE response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  AREA_SELECTED: {
    parseRequest: createGuardParser(
      'runtime AREA_SELECTED message',
      createMessageGuard({
        type: 'AREA_SELECTED',
        required: { area: isViewportRegion },
      })
    ),
    parseResponse: createGuardParser(
      'runtime AREA_SELECTED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  REGION_CAPTURE_STARTED: {
    parseRequest: createGuardParser(
      'runtime REGION_CAPTURE_STARTED message',
      createMessageGuard({ type: 'REGION_CAPTURE_STARTED' })
    ),
    parseResponse: createGuardParser(
      'runtime REGION_CAPTURE_STARTED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  REGION_CAPTURE_ERROR: {
    parseRequest: createGuardParser(
      'runtime REGION_CAPTURE_ERROR message',
      createMessageGuard({
        type: 'REGION_CAPTURE_ERROR',
        required: { error: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REGION_CAPTURE_ERROR response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  REGION_CAPTURE_STOPPED: {
    parseRequest: createGuardParser(
      'runtime REGION_CAPTURE_STOPPED message',
      createMessageGuard({ type: 'REGION_CAPTURE_STOPPED' })
    ),
    parseResponse: createGuardParser(
      'runtime REGION_CAPTURE_STOPPED response',
      createRuntimeResponseGuard({ allowUndefined: true })
    ),
  },
  ...runtimeVideoExportCapabilityContracts,
} satisfies PartialRuntimeRegistry;
