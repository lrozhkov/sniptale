import type { CreateScreenshotControllerActionsArgs } from './action-types';
import { closeQuickActionCapture, shouldExitAfterQuickActionCapture } from '../mode';

export async function closeFailedQuickActionCapture(
  args: CreateScreenshotControllerActionsArgs,
  runToken: number
): Promise<boolean> {
  if (!shouldExitAfterQuickActionCapture(args.params.quickActionOverlayRef)) return false;

  try {
    await closeQuickActionCapture(args.params, args.runtime, runToken);
    return true;
  } catch {
    return false;
  }
}
