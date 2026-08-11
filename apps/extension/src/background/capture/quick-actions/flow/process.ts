import type { ProcessQuickActionArgs } from './shared';
import { loadQuickActionRuntimeContext } from './load';
import { runCaptureFlow, runSelectionFlow } from './flows';
import { runDesktopQuickAction } from '../desktop/workflow';

export async function processQuickAction(
  args: ProcessQuickActionArgs & {
    runtimeContext?: Awaited<ReturnType<typeof loadQuickActionRuntimeContext>>;
  }
): Promise<{ result: 'accepted' | 'blocked' | 'cancelled' }> {
  const context = args.runtimeContext ?? (await loadQuickActionRuntimeContext(args.actionId));

  if (context.captureMode === 'desktop') {
    return runDesktopQuickAction({ context, tabId: args.tabId });
  }

  if (context.captureMode === 'selection') {
    return await runSelectionFlow({ ...args, ...context });
  }

  return await runCaptureFlow({
    ...args,
    ...context,
    captureMode: context.captureMode,
  });
}
