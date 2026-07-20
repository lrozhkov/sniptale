import type { QuickActionsDisplayMode } from '../../contracts/settings';
import type { QuickActionDisplayModeInput } from './types';

export const DEFAULT_QUICK_ACTIONS_DISPLAY_MODE: QuickActionsDisplayMode = 'list';

export function sanitizeQuickActionsDisplayMode(
  mode: QuickActionDisplayModeInput
): QuickActionsDisplayMode {
  return mode === 'hidden' ? 'hidden' : DEFAULT_QUICK_ACTIONS_DISPLAY_MODE;
}
