import type { HotkeyConfig } from '../../contracts/settings';
import {
  codeKeyMap,
  keyAliases,
  legacyLayoutQwertyKeyMap,
} from '@sniptale/foundation/utils/hotkey-key-maps';

const RESERVED_HOTKEYS: string[] = [
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+N',
  'Ctrl+R',
  'Ctrl+Tab',
  'Ctrl+Shift+T',
  'Ctrl+Shift+Tab',
  'Ctrl+Shift+N',
  'Ctrl+L',
  'Ctrl+O',
  'Ctrl+P',
  'Ctrl+S',
  'Ctrl+F',
  'Ctrl+G',
  'Ctrl+H',
  'Ctrl+J',
  'Ctrl+K',
  'Ctrl+D',
  'Alt+F4',
  'F5',
  'F11',
  'F12',
  'Cmd+T',
  'Cmd+W',
  'Cmd+N',
  'Cmd+R',
  'Cmd+Shift+T',
  'Cmd+Shift+N',
  'Cmd+L',
  'Cmd+P',
  'Cmd+S',
  'Cmd+F',
];

export interface HotkeyEventLike {
  altKey: boolean;
  code?: string | undefined;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
}

function normalizeFunctionKey(key: string): string | null {
  const match = /^F(\d{1,2})$/i.exec(key);
  if (!match) {
    return null;
  }
  return `F${match[1]}`;
}

export function normalizeHotkeyKey(key: string, code?: string): string {
  if (/^Key[A-Z]$/.test(code ?? '')) {
    return (code as string).slice(3);
  }
  if (/^Digit\d$/.test(code ?? '')) {
    return (code as string).slice(5);
  }
  const codeKey = code ? codeKeyMap[code] : undefined;
  if (codeKey) {
    return codeKey;
  }

  const functionKey = normalizeFunctionKey(key);
  if (functionKey) {
    return functionKey;
  }
  const alias = keyAliases[key] ?? keyAliases[key.slice(0, 1).toUpperCase() + key.slice(1)];
  if (alias) {
    return alias;
  }
  const upperKey = key.toUpperCase();
  if (upperKey.length === 1) {
    return legacyLayoutQwertyKeyMap[key] ?? legacyLayoutQwertyKeyMap[upperKey] ?? upperKey;
  }
  return key;
}

export function normalizeHotkeyConfig(hotkey: HotkeyConfig): HotkeyConfig {
  return {
    ...hotkey,
    key: normalizeHotkeyKey(hotkey.key),
  };
}

export function hotkeyEventToConfig(event: HotkeyEventLike): HotkeyConfig {
  return {
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    key: normalizeHotkeyKey(event.key, event.code),
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  };
}

export function hotkeyToKeyString(hotkey: HotkeyConfig): string {
  const normalizedHotkey = normalizeHotkeyConfig(hotkey);
  const parts: string[] = [];
  if (normalizedHotkey.ctrlKey) {
    parts.push('Ctrl');
  }
  if (normalizedHotkey.metaKey) {
    parts.push('Cmd');
  }
  if (normalizedHotkey.altKey) {
    parts.push('Alt');
  }
  if (normalizedHotkey.shiftKey) {
    parts.push('Shift');
  }

  parts.push(normalizedHotkey.key);
  return parts.join('+');
}

export function normalizeShortcutLabel(shortcutLabel: string): string {
  const parts = shortcutLabel
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return '';
  }

  const key = parts.at(-1) ?? '';
  const modifiers = parts.slice(0, -1);
  return [...modifiers, normalizeHotkeyKey(key)].join('+');
}

export function matchesHotkeyEvent(event: HotkeyEventLike, hotkey: HotkeyConfig): boolean {
  const normalizedHotkey = normalizeHotkeyConfig(hotkey);
  return (
    normalizeHotkeyKey(event.key, event.code) === normalizedHotkey.key &&
    event.ctrlKey === normalizedHotkey.ctrlKey &&
    event.shiftKey === normalizedHotkey.shiftKey &&
    event.altKey === normalizedHotkey.altKey &&
    event.metaKey === normalizedHotkey.metaKey
  );
}

export function isHotkeyReserved(hotkey: HotkeyConfig): boolean {
  return RESERVED_HOTKEYS.includes(hotkeyToKeyString(hotkey));
}
