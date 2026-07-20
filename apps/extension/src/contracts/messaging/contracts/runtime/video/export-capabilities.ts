import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { RuntimeRequestByType, RuntimeResponseByType } from '../../runtime-message/index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isString,
  isVideoExportCapabilities,
  isVideoProjectExportSettings,
} from '../../../validators/index';

type PartialRuntimeRegistry = Partial<
  MessageContractRegistry<RuntimeRequestByType, RuntimeResponseByType>
>;

export const runtimeVideoExportCapabilityContracts = {
  [VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES]: {
    parseRequest: createGuardParser(
      'runtime GET_PROJECT_EXPORT_CAPABILITIES message',
      createMessageGuard({
        type: VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES,
        required: { settings: isVideoProjectExportSettings },
        optional: { jobId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime GET_PROJECT_EXPORT_CAPABILITIES response',
      createRuntimeResponseGuard({
        optional: {
          capabilities: isVideoExportCapabilities,
          capabilityToken: isString,
          cancelCapabilityToken: isString,
          ownerDocumentId: isString,
        },
      })
    ),
  },
  [VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES]: {
    parseRequest: createGuardParser(
      'runtime OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES message',
      createMessageGuard({
        type: VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES,
        required: {
          capabilityToken: isString,
          settings: isVideoProjectExportSettings,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES response',
      createRuntimeResponseGuard({ optional: { capabilities: isVideoExportCapabilities } })
    ),
  },
} satisfies PartialRuntimeRegistry;
