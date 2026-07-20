import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import type { RuntimeProjectExportLifecycleResponse } from '../../../video/export';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../../runtime-message/index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isRecord,
  isString,
} from '../../../validators/index';

const V = VideoMessageType;

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

const lifecycleResponseGuard = createRuntimeResponseGuard<RuntimeProjectExportLifecycleResponse>({
  optional: { result: isString },
});
const lifecycleOwnerFields = {
  targetDocumentId: isString,
  targetSenderUrl: isString,
};

export const runtimeVideoExportLifecycleContracts = {
  [V.PROJECT_EXPORT_PROGRESS]: {
    parseRequest: createGuardParser(
      'runtime PROJECT_EXPORT_PROGRESS message',
      createMessageGuard({
        type: V.PROJECT_EXPORT_PROGRESS,
        required: { jobId: isString, status: isRecord },
        optional: lifecycleOwnerFields,
      })
    ),
    parseResponse: createGuardParser(
      'runtime PROJECT_EXPORT_PROGRESS response',
      lifecycleResponseGuard
    ),
  },
  [V.PROJECT_EXPORT_COMPLETED]: {
    parseRequest: createGuardParser(
      'runtime PROJECT_EXPORT_COMPLETED message',
      createMessageGuard({
        type: V.PROJECT_EXPORT_COMPLETED,
        required: {
          jobId: isString,
          projectId: isString,
          recordingId: isString,
          exportId: isString,
          filename: isString,
          format: isString,
        },
        optional: lifecycleOwnerFields,
      })
    ),
    parseResponse: createGuardParser(
      'runtime PROJECT_EXPORT_COMPLETED response',
      lifecycleResponseGuard
    ),
  },
  [V.PROJECT_EXPORT_FAILED]: {
    parseRequest: createGuardParser(
      'runtime PROJECT_EXPORT_FAILED message',
      createMessageGuard({
        type: V.PROJECT_EXPORT_FAILED,
        required: { jobId: isString, error: isString },
        optional: lifecycleOwnerFields,
      })
    ),
    parseResponse: createGuardParser(
      'runtime PROJECT_EXPORT_FAILED response',
      lifecycleResponseGuard
    ),
  },
  [V.PROJECT_EXPORT_CANCELLED]: {
    parseRequest: createGuardParser(
      'runtime PROJECT_EXPORT_CANCELLED message',
      createMessageGuard({
        type: V.PROJECT_EXPORT_CANCELLED,
        required: { jobId: isString },
        optional: lifecycleOwnerFields,
      })
    ),
    parseResponse: createGuardParser(
      'runtime PROJECT_EXPORT_CANCELLED response',
      lifecycleResponseGuard
    ),
  },
} satisfies PartialRuntimeRegistry;
