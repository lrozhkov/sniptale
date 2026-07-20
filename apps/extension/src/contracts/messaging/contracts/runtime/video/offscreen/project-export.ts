import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  isProjectExportInputReference,
  isString,
  isVideoProjectExportSettings,
} from '../../../../validators/index';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../../../runtime-message/index';
import { offscreenAcceptedAckResponseGuard } from './ack';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

export const runtimeVideoOffscreenProjectExportMessageContracts = {
  [VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_START_PROJECT_EXPORT message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_START_PROJECT_EXPORT,
        required: {
          capabilityToken: isString,
          input: isProjectExportInputReference,
          jobId: isString,
          settings: isVideoProjectExportSettings,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_START_PROJECT_EXPORT response',
      offscreenAcceptedAckResponseGuard
    ),
  },
  [VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_CANCEL_PROJECT_EXPORT message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_CANCEL_PROJECT_EXPORT,
        required: { capabilityToken: isString, jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_CANCEL_PROJECT_EXPORT response',
      offscreenAcceptedAckResponseGuard
    ),
  },
} satisfies PartialRuntimeRegistry;
