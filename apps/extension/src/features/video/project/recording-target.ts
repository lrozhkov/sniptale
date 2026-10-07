/** Stable UI semantics retained with a recording; never includes a control value. */
export interface RecordingTargetSemantics {
  kind: RecordingTargetKind;
  source: 'html' | 'aria' | 'editable' | 'unknown';
}

type RecordingTargetKind =
  | 'text-field'
  | 'button'
  | 'link'
  | 'checkbox'
  | 'radio'
  | 'switch'
  | 'select'
  | 'listbox'
  | 'combobox'
  | 'slider'
  | 'number-field'
  | 'tab'
  | 'menuitem'
  | 'other-control'
  | 'unknown';

const roleKinds: Readonly<Record<string, RecordingTargetKind>> = {
  textbox: 'text-field',
  searchbox: 'text-field',
  button: 'button',
  link: 'link',
  checkbox: 'checkbox',
  radio: 'radio',
  switch: 'switch',
  listbox: 'listbox',
  combobox: 'combobox',
  slider: 'slider',
  spinbutton: 'number-field',
  tab: 'tab',
  menuitem: 'menuitem',
  menuitemcheckbox: 'menuitem',
  menuitemradio: 'menuitem',
};
const otherRoles = new Set([
  'alert',
  'alertdialog',
  'application',
  'article',
  'banner',
  'blockquote',
  'caption',
  'cell',
  'code',
  'columnheader',
  'complementary',
  'contentinfo',
  'definition',
  'deletion',
  'dialog',
  'directory',
  'document',
  'emphasis',
  'feed',
  'figure',
  'form',
  'generic',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'insertion',
  'list',
  'listitem',
  'log',
  'main',
  'marquee',
  'math',
  'meter',
  'navigation',
  'none',
  'note',
  'option',
  'paragraph',
  'presentation',
  'progressbar',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'search',
  'separator',
  'status',
  'strong',
  'subscript',
  'superscript',
  'table',
  'tablist',
  'tabpanel',
  'term',
  'time',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treegrid',
  'treeitem',
  'radiogroup',
]);

/** Uses the first recognized role, including recognized roles outside our control taxonomy. */
export function recordingTargetRole(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.split(/\s+/).find((role) => Object.hasOwn(roleKinds, role) || otherRoles.has(role));
}

const inputKinds: Readonly<Record<string, RecordingTargetKind>> = {
  text: 'text-field',
  search: 'text-field',
  email: 'text-field',
  url: 'text-field',
  tel: 'text-field',
  password: 'text-field',
  button: 'button',
  submit: 'button',
  reset: 'button',
  image: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  number: 'number-field',
  date: 'other-control',
  'datetime-local': 'other-control',
  month: 'other-control',
  week: 'other-control',
  time: 'other-control',
  color: 'other-control',
  file: 'other-control',
};
const tagKinds: Readonly<Record<string, RecordingTargetKind>> = {
  button: 'button',
  textarea: 'text-field',
  select: 'select',
};
const listInputTypes = new Set(['text', 'search', 'email', 'url', 'tel']);
const allowedRoles: Readonly<Partial<Record<RecordingTargetKind, readonly string[]>>> = {
  button: [
    'button',
    'checkbox',
    'combobox',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'radio',
    'switch',
    'tab',
    'slider',
  ],
  checkbox: ['checkbox', 'button', 'menuitemcheckbox', 'option', 'switch'],
  radio: ['radio', 'menuitemradio'],
  link: [
    'link',
    'button',
    'checkbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'radio',
    'switch',
    'tab',
    'treeitem',
  ],
  'text-field': ['textbox', 'searchbox', 'combobox', 'spinbutton'],
  select: ['combobox', 'listbox'],
  slider: ['slider'],
  'number-field': ['spinbutton'],
  combobox: ['combobox'],
};
const restrictedInputRoles: Readonly<Record<string, readonly string[]>> = {
  password: [],
  hidden: [],
  search: ['searchbox'],
  email: ['textbox'],
  url: ['textbox'],
  tel: ['textbox'],
};

function nativeKind(data: Readonly<Record<string, unknown>>): RecordingTargetKind {
  const tag = data['targetTag'];
  if (tag === 'a') return data['targetHasHref'] === 'yes' ? 'link' : 'unknown';
  if (tag !== 'input')
    return typeof tag === 'string' && Object.hasOwn(tagKinds, tag)
      ? (tagKinds[tag] ?? 'unknown')
      : 'unknown';
  const type = data['targetType'];
  if (typeof type !== 'string') return 'unknown';
  if (listInputTypes.has(type) && data['targetHasList'] === 'yes') return 'combobox';
  return Object.hasOwn(inputKinds, type) ? (inputKinds[type] ?? 'unknown') : 'unknown';
}

function permitsRole(
  native: RecordingTargetKind,
  role: string,
  data: Readonly<Record<string, unknown>>
): boolean {
  if (data['targetTag'] === 'textarea') return role === 'textbox';
  if (data['targetTag'] === 'input') {
    if (native === 'combobox') return role === 'combobox';
    const type = data['targetType'];
    if (typeof type === 'string' && Object.hasOwn(restrictedInputRoles, type))
      return restrictedInputRoles[type]?.includes(role) ?? false;
    if (type === 'image' && role === 'combobox') return false;
  }
  return native === 'unknown' || (allowedRoles[native]?.includes(role) ?? false);
}

function storedSemantics(data: Readonly<Record<string, unknown>>): RecordingTargetSemantics | null {
  const kind = data['targetKind'];
  const source = data['targetSource'];
  const kinds: readonly RecordingTargetKind[] = [
    'text-field',
    'button',
    'link',
    'checkbox',
    'radio',
    'switch',
    'select',
    'listbox',
    'combobox',
    'slider',
    'number-field',
    'tab',
    'menuitem',
    'other-control',
    'unknown',
  ];
  const parsedKind = kinds.find((candidate) => candidate === kind);
  if (
    !parsedKind ||
    (source !== 'html' && source !== 'aria' && source !== 'editable' && source !== 'unknown')
  )
    return null;
  if ((parsedKind === 'unknown') !== (source === 'unknown')) return null;
  if (source === 'editable' && parsedKind !== 'text-field') return null;
  return { kind: parsedKind, source };
}

/** Pure legacy-compatible interpretation. Invalid optional metadata never invalidates a recording. */
export function resolveRecordingTarget(
  data: Readonly<Record<string, unknown>>
): RecordingTargetSemantics {
  const stored = storedSemantics(data);
  if (stored) return stored;
  const native = nativeKind(data);
  const role = recordingTargetRole(data['targetRole']);
  if (role && permitsRole(native, role, data)) {
    const kind = Object.hasOwn(roleKinds, role) ? roleKinds[role] : undefined;
    if (kind) return { kind, source: 'aria' };
  }
  if (native !== 'unknown') return { kind: native, source: 'html' };
  if (data['targetEditable'] === 'yes') return { kind: 'text-field', source: 'editable' };
  return { kind: 'unknown', source: 'unknown' };
}
