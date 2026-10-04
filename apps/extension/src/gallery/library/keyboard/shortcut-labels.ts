import { formatHotkey } from '../../../features/keyboard-shortcuts/hotkey-format';

export function getGalleryPrimaryShortcut(key: 'A' | 'F'): string {
  const apple = /Mac|iPod|iPhone|iPad/.test(
    typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent
  );
  return formatHotkey({ key, ctrlKey: !apple, metaKey: apple, altKey: false, shiftKey: false });
}

export function getGalleryShortcutTitle(label: string, shortcut: string): string {
  return `${label} (${shortcut})`;
}
