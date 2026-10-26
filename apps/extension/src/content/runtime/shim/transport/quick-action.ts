import type { QuickActionHotkeyAction } from '../../../platform/quick-action-hotkeys';
import {
  requireShimSuccess,
  resolveShimTransportDeps,
  requestShimContentIntent,
  type ShimTransportDeps,
} from './shared';
export async function triggerQuickActionFromShim(
  action: QuickActionHotkeyAction,
  deps?: ShimTransportDeps
): Promise<void> {
  const resolved = resolveShimTransportDeps(deps);
  const contentIntent = await requestShimContentIntent(
    resolved,
    'TRIGGER_QUICK_ACTION',
    resolved.requestId()
  );
  requireShimSuccess(
    await resolved.sendRuntimeMessage({
      type: 'TRIGGER_QUICK_ACTION',
      actionId: action.id,
      contentIntent,
    }),
    'Quick action hotkey trigger failed'
  );
}
