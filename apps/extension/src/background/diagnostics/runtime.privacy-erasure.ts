import type { ActiveDiagnosticsSession } from '@sniptale/platform/observability/diagnostics/types';
import { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';
import { getBackgroundRuntimeMessaging } from '../routing-contracts/runtime-messaging/services';

export async function shutDownDiagnosticsSessionForPrivacyErasure(
  session: ActiveDiagnosticsSession
): Promise<void> {
  await getBackgroundRuntimeMessaging().sendTabMessage(session.tabId, {
    type: VideoMessageType.DISABLE_DIAGNOSTIC_LOGGER,
  });
}
