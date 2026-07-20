import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import {
  createGuardParser,
  type MessageContractRegistry,
} from '@sniptale/runtime-contracts/messaging/parsers/utils';
import type { TabRequestByType, TabResponseByType } from '../index';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isNumber,
  isRecordingTelemetrySnapshot,
  isString,
  isViewportInfo,
} from '../../validators/index';

type PartialTabRegistry = Partial<MessageContractRegistry<TabRequestByType, TabResponseByType>>;

export const tabVideoControlledCursorContracts = {
  [VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab ENABLE_CONTROLLED_CURSOR_CAPTURE message',
      createMessageGuard({
        type: VideoMessageType.ENABLE_CONTROLLED_CURSOR_CAPTURE,
        required: { recordingId: isString },
        optional: { offsetSeconds: isNumber },
      })
    ),
    parseResponse: createGuardParser(
      'tab ENABLE_CONTROLLED_CURSOR_CAPTURE response',
      createRuntimeResponseGuard({ optional: { viewport: isViewportInfo } })
    ),
  },
  [VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab DISABLE_CONTROLLED_CURSOR_CAPTURE message',
      createMessageGuard({ type: VideoMessageType.DISABLE_CONTROLLED_CURSOR_CAPTURE })
    ),
    parseResponse: createGuardParser(
      'tab DISABLE_CONTROLLED_CURSOR_CAPTURE response',
      createRuntimeResponseGuard({
        optional: { telemetry: isRecordingTelemetrySnapshot },
      })
    ),
  },
  [VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab PAUSE_CONTROLLED_CURSOR_CAPTURE message',
      createMessageGuard({ type: VideoMessageType.PAUSE_CONTROLLED_CURSOR_CAPTURE })
    ),
    parseResponse: createGuardParser(
      'tab PAUSE_CONTROLLED_CURSOR_CAPTURE response',
      createRuntimeResponseGuard()
    ),
  },
  [VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE]: {
    parseRequest: createGuardParser(
      'tab RESUME_CONTROLLED_CURSOR_CAPTURE message',
      createMessageGuard({ type: VideoMessageType.RESUME_CONTROLLED_CURSOR_CAPTURE })
    ),
    parseResponse: createGuardParser(
      'tab RESUME_CONTROLLED_CURSOR_CAPTURE response',
      createRuntimeResponseGuard()
    ),
  },
} satisfies PartialTabRegistry;
