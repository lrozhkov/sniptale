import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import { createMessageGuard, createRuntimeResponseGuard, isRecord } from '../../../validators';
import { isPageCorner } from '../../../../page-launch';
import type {
  RuntimePageLaunchRequestByType,
  RuntimePageLaunchResponseByType,
} from '../../runtime-message/page-launch.types';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry';
const responseShape = createRuntimeResponseGuard({ optional: { corner: isPageCorner } });
function isPageLaunchResponse(
  value: unknown
): value is RuntimePageLaunchResponseByType[typeof MessageType.PAGE_LAUNCH_PREFERENCES] {
  return (
    isRecord(value) &&
    responseShape(value) &&
    (value['success'] === false || isPageCorner(value['corner']))
  );
}
export const runtimePageLaunchContracts = {
  [MessageType.PAGE_LAUNCH_PREFERENCES]: {
    parseRequest: createGuardParser(
      'runtime PAGE_LAUNCH_PREFERENCES message',
      createMessageGuard<
        typeof MessageType.PAGE_LAUNCH_PREFERENCES,
        RuntimePageLaunchRequestByType[typeof MessageType.PAGE_LAUNCH_PREFERENCES]
      >({
        type: MessageType.PAGE_LAUNCH_PREFERENCES,
        required: { corner: isPageCorner },
      })
    ),
    parseResponse: createGuardParser(
      'runtime PAGE_LAUNCH_PREFERENCES response',
      isPageLaunchResponse
    ),
  },
} satisfies PartialRuntimeRegistry;
