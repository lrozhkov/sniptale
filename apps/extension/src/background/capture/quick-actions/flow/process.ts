import type { ProcessQuickActionArgs } from './shared';
import { loadQuickActionRuntimeContext } from './load';
import { runCaptureFlow, runSelectionFlow } from './flows';

export async function processQuickAction(
  args: ProcessQuickActionArgs
): Promise<{ result: 'accepted' | 'blocked' }> {
  const context = await loadQuickActionRuntimeContext(args.actionId);

  if (context.captureMode === 'selection') {
    return await runSelectionFlow({ ...args, ...context });
  }

  return await runCaptureFlow({
    ...args,
    ...context,
    captureMode: context.captureMode,
  });
}
