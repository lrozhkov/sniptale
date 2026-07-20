import type { HotkeyConfig } from '../../contracts/settings';
import { normalizeHotkeyConfig } from './hotkeys';

export function formatHotkey(hotkey: HotkeyConfig): string {
  const normalizedHotkey = normalizeHotkeyConfig(hotkey);
  const isMac = /Mac|iPod|iPhone|iPad/.test(
    typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : ''
  );

  const parts: string[] = [];
  if (normalizedHotkey.ctrlKey) {
    parts.push('Ctrl');
  }
  if (normalizedHotkey.metaKey) {
    parts.push(isMac ? '⌘' : 'Win');
  }
  if (normalizedHotkey.altKey) {
    parts.push(isMac ? '⌥' : 'Alt');
  }
  if (normalizedHotkey.shiftKey) {
    parts.push(isMac ? '⇧' : 'Shift');
  }

  parts.push(normalizedHotkey.key);
  return parts.join(isMac ? '' : '+');
}
