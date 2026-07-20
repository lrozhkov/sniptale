import type { NativeTrayShortcutPriority } from '../../../contracts/native-app';
import type { QuickAction } from '../../../contracts/settings';
import { hotkeyToKeyString } from '../../../features/keyboard-shortcuts/hotkeys';

export function createBrowserActiveShortcutPriority(
  quickActions: QuickAction[]
): NativeTrayShortcutPriority | null {
  const shortcutLabels = [
    ...new Set(
      quickActions
        .filter((action) => action.status && action.hotkey)
        .map((action) => (action.hotkey ? hotkeyToKeyString(action.hotkey) : ''))
        .filter(Boolean)
    ),
  ];
  return shortcutLabels.length > 0
    ? { shortcutLabels, when: 'browser-active', winner: 'extension' }
    : null;
}
