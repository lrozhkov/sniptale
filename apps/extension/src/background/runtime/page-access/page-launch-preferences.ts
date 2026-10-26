import {
  MessageType,
  type ResponseSender,
} from '@sniptale/runtime-contracts/messaging/message-types';
import { runtimePageLaunchContracts } from '../../../contracts/messaging/contracts/runtime/actions/page-launch';
import type { RuntimePageLaunchResponseByType } from '../../../contracts/messaging/contracts/runtime-message/page-launch.types';
import { normalizePageLaunchPreferences } from '../../../contracts/page-launch';
import { patchPageLaunchCorner } from '../../../composition/persistence/settings';
import { getMediaAuthorityGeneration } from '../../mutation-exclusion/media-activity';

export function routePageLaunchPreferencesMessage(
  message: unknown,
  sendResponse: ResponseSender<
    RuntimePageLaunchResponseByType[typeof MessageType.PAGE_LAUNCH_PREFERENCES]
  >
): boolean {
  let parsed;
  try {
    parsed = runtimePageLaunchContracts[MessageType.PAGE_LAUNCH_PREFERENCES].parseRequest(message);
  } catch {
    return false;
  }
  const generation = getMediaAuthorityGeneration();
  void patchPageLaunchCorner(
    parsed.corner,
    () => generation === getMediaAuthorityGeneration()
  ).then(
    (settings) =>
      sendResponse({
        success: true,
        corner: normalizePageLaunchPreferences(settings.pageLaunch).corner,
      }),
    () => sendResponse({ success: false, error: 'page-launch-preference-write-failed' })
  );
  return true;
}
