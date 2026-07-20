import type {
  NativeCaptureSettings,
  NativeTrayActionKey,
} from '@sniptale/runtime-contracts/video/types/types';
import { normalizeShortcutLabel } from '../../../features/keyboard-shortcuts/hotkeys';

export function getDuplicateShortcutKeys(
  keys: NativeTrayActionKey[],
  settings: NativeCaptureSettings
): Set<NativeTrayActionKey> {
  const seen = new Map<string, NativeTrayActionKey>();
  const duplicates = new Set<NativeTrayActionKey>();
  for (const key of keys) {
    const shortcutLabel = normalizeShortcutLabel(settings.trayActions[key].shortcutLabel);
    if (!shortcutLabel) {
      continue;
    }
    const existing = seen.get(shortcutLabel);
    if (existing) {
      duplicates.add(existing);
      duplicates.add(key);
    } else {
      seen.set(shortcutLabel, key);
    }
  }
  return duplicates;
}

export function isDuplicateShortcut(args: {
  currentKey: NativeTrayActionKey;
  keys: NativeTrayActionKey[];
  settings: NativeCaptureSettings;
  shortcutLabel: string;
}): boolean {
  const normalized = normalizeShortcutLabel(args.shortcutLabel);
  return args.keys.some(
    (key) =>
      key !== args.currentKey &&
      normalizeShortcutLabel(args.settings.trayActions[key].shortcutLabel) === normalized
  );
}
