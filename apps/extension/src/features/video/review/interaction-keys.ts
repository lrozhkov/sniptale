/** Stable authored key names preserve target-platform spelling independently of the host OS. */
export const REVIEW_KEY_CATALOG = [
  ...['Ctrl', 'Shift', 'Alt', 'AltGraph', 'Cmd', 'Win', 'Meta', 'Option', 'Fn', 'CapsLock'].map(
    (value) => ({
      value,
      label: value,
      search:
        value === 'Cmd'
          ? 'command mac macos apple ⌘'
          : value === 'Win'
            ? 'windows super os'
            : value === 'Option'
              ? 'mac macos ⌥'
              : value === 'Ctrl'
                ? 'control'
                : '',
    })
  ),
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ0123456789').map(
    (value) => ({ value, label: value, search: '' })
  ),
  ...Array.from({ length: 24 }, (_, i) => ({
    value: `F${i + 1}`,
    label: `F${i + 1}`,
    search: 'function',
  })),
  ...[
    'Enter',
    'Space',
    'Tab',
    'Escape',
    'Backspace',
    'Delete',
    'Insert',
    'Home',
    'End',
    'PageUp',
    'PageDown',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'NumLock',
    'ScrollLock',
    'Pause',
    'PrintScreen',
    'ContextMenu',
  ].map((value) => ({
    value,
    label: value,
    search:
      value === 'Escape'
        ? 'esc'
        : value.startsWith('Arrow')
          ? `arrow ${value.slice(5)}`
          : value === 'Backspace'
            ? 'back space'
            : value === 'Space'
              ? 'spacebar'
              : '',
  })),
  ...[
    ['Plus', '+'],
    ['Minus', '-'],
    ['Equal', '='],
    ['Comma', ','],
    ['Period', '.'],
    ['Slash', '/'],
    ['Backslash', '\\'],
    ['Semicolon', ';'],
    ['Quote', "'"],
    ['Backquote', '`'],
    ['BracketLeft', '['],
    ['BracketRight', ']'],
  ].map(([value, label]) => ({ value: value!, label: label!, search: '' })),
];
export function reviewChordKeys(label: string, keys?: readonly string[]): string[] {
  if (keys?.length) return [...keys];
  const parts = label.split('+').map((p) => p.trim());
  if (parts.at(-1) === '' && parts.length > 1) {
    while (parts.at(-1) === '') parts.pop();
    parts.push('Plus');
  }
  const aliases: Readonly<Record<string, string>> = {
    Control: 'Ctrl',
    Command: 'Cmd',
    '⌘': 'Cmd',
    OS: 'Win',
    Windows: 'Win',
    Esc: 'Escape',
    ' ': 'Space',
  };
  return parts.filter(Boolean).map((p) => aliases[p] ?? p);
}
export function reviewChordLabel(keys: readonly string[]): string {
  return keys
    .map((key) => REVIEW_KEY_CATALOG.find((option) => option.value === key)?.label ?? key)
    .join('+');
}
