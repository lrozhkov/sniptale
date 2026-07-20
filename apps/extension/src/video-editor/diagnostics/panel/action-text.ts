import { translate } from '../../../platform/i18n';
import type { DiagnosticEvent } from '@sniptale/platform/observability/diagnostics/types';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';
import type { HumanReadableAction } from '../action-text';

const MAX_HUMAN_READABLE_CACHE_ENTRIES = 200;
const humanReadableCache = new Map<string, HumanReadableAction | null>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function getStringRecord(value: unknown): Record<string, string | undefined> {
  if (!isRecord(value)) {
    return {};
  }

  const record: Record<string, string | undefined> = {};
  for (const key of Object.keys(value)) {
    const entry = value[key];
    if (typeof entry === 'string') {
      record[key] = entry;
    }
  }
  return record;
}

function cacheHumanReadableAction(key: string, action: HumanReadableAction | null): void {
  if (!humanReadableCache.has(key) && humanReadableCache.size >= MAX_HUMAN_READABLE_CACHE_ENTRIES) {
    const oldestKey = humanReadableCache.keys().next().value;
    if (oldestKey) {
      humanReadableCache.delete(oldestKey);
    }
  }

  humanReadableCache.set(key, action);
}

export function getHumanReadableAction(
  event: DiagnosticEvent,
  formatTs: (tsMs: number) => string
): HumanReadableAction | null {
  if (event.kind !== 'action') {
    return null;
  }

  const cached = humanReadableCache.get(event.id);
  if (cached !== undefined) {
    return cached;
  }

  const action = convertToHumanReadable(event, formatTs);
  cacheHumanReadableAction(event.id, action);
  return action;
}

function convertToHumanReadable(
  event: DiagnosticEvent,
  formatTs: (tsMs: number) => string
): HumanReadableAction | null {
  if (event.kind !== 'action') {
    return null;
  }

  const data = isRecord(event.data) ? event.data : undefined;
  const actionType = asString(data?.['actionType']) || event.message.split(' ')[0] || '';

  return {
    tsMs: event.tsMs,
    kind: resolveActionKind(actionType),
    displayText: `${formatTs(event.tsMs)}: ${formatActionText(actionType, data, event.message)}`,
    raw: event,
  };
}

function resolveActionKind(actionType: string): HumanReadableAction['kind'] {
  if (actionType === 'keydown' || actionType === 'scroll' || actionType === 'input') {
    return actionType;
  }

  return actionType === 'change' ? 'change' : 'click';
}

function formatActionText(
  actionType: string,
  data: Record<string, unknown> | undefined,
  fallbackMessage: string
) {
  if (actionType === 'click') {
    const target = getStringRecord(data?.['target']);
    const role = classifyElementLocal(target);
    return formatClickText(getElementTextLocal(target), role);
  }

  if (actionType === 'keydown') {
    return formatKeydownText(
      asString(data?.['key']) || '',
      asBoolean(data?.['ctrlKey']),
      asBoolean(data?.['metaKey']),
      asBoolean(data?.['altKey'])
    );
  }

  if (actionType === 'scroll') {
    return data?.['direction'] === 'up'
      ? translate('videoEditor.diagnostics.scrollUp')
      : translate('videoEditor.diagnostics.scrollDown');
  }

  if (actionType === 'input' || actionType === 'change') {
    const target = getStringRecord(data?.['target']);
    const prefix =
      actionType === 'input'
        ? translate('videoEditor.diagnostics.textInputPrefix')
        : translate('videoEditor.diagnostics.changePrefix');
    return `${prefix} «${getElementTextLocal(target)}»`;
  }

  return fallbackMessage;
}

function classifyElementLocal(target: Record<string, string | undefined>) {
  const tagName = target['tagName']?.toLowerCase() || '';
  const role = target['role']?.toLowerCase();
  const type = target['type']?.toLowerCase();
  const className = target['className']?.toLowerCase() || '';

  if (role === 'button' || tagName === 'button' || className.includes('button')) {
    return 'button';
  }

  if (role === 'link' || tagName === 'a') {
    return 'link';
  }

  if (role === 'tab' || className.includes('tab')) {
    return 'tab';
  }

  if (role === 'checkbox' || type === 'checkbox') {
    return 'checkbox';
  }

  if (role === 'radio' || type === 'radio') {
    return 'radio';
  }

  if (tagName === 'select') {
    return 'select';
  }

  if (tagName === 'input' || tagName === 'textarea') {
    return 'input';
  }

  if (className.includes('icon') || className.includes('vectoricon')) {
    return 'icon';
  }

  if (tagName === 'img') {
    return 'image';
  }

  if (['p', 'span', 'div'].includes(tagName)) {
    return 'text';
  }

  return 'unknown';
}

function getElementTextLocal(target: Record<string, string | undefined>) {
  const candidates = [target['ariaLabel'], target['title'], target['text'], target['placeholder']];
  const value = candidates.find((candidate) => candidate?.trim());

  if (value) {
    return truncateTextLocal(value.trim(), 50);
  }

  return `${translate('videoEditor.diagnostics.noTextFallbackPrefix')} (${target['tagName'] || 'element'}${
    target['id'] ? `#${target['id']}` : ''
  })`;
}

function truncateTextLocal(text: string, maxLen: number) {
  if (text.length <= maxLen) {
    return text;
  }

  return `${text.slice(0, maxLen - 1)}…`;
}

function formatClickText(text: string, role: string) {
  const roleLabels: Record<string, string> = {
    button: translate('videoEditor.diagnostics.roleButton'),
    link: translate('videoEditor.diagnostics.roleLink'),
    input: translate('videoEditor.diagnostics.roleInput'),
    checkbox: translate('videoEditor.diagnostics.roleCheckbox'),
    radio: translate('videoEditor.diagnostics.roleRadio'),
    select: translate('videoEditor.diagnostics.roleSelect'),
    tab: translate('videoEditor.diagnostics.roleTab'),
    menu: translate('videoEditor.diagnostics.roleMenu'),
    menuitem: translate('videoEditor.diagnostics.roleMenuItem'),
    icon: translate('videoEditor.diagnostics.roleIcon'),
    text: translate('videoEditor.diagnostics.roleText'),
    image: translate('videoEditor.diagnostics.roleImage'),
    unknown: '',
  };
  const label = roleLabels[role] || '';

  return label
    ? `${translate('videoEditor.diagnostics.clickPrefix')} «${text}» (${label})`
    : `${translate('videoEditor.diagnostics.clickPrefix')} «${text}»`;
}

function formatKeydownText(key: string, ctrlKey?: boolean, metaKey?: boolean, altKey?: boolean) {
  const normalizedKey = normalizeHotkeyKey(key);
  const specialKeys: Record<string, string> = {
    Enter: translate('videoEditor.diagnostics.keyEnter'),
    Escape: translate('videoEditor.diagnostics.keyEscape'),
    Tab: translate('videoEditor.diagnostics.keyTab'),
    Backspace: translate('videoEditor.diagnostics.keyBackspace'),
    Delete: translate('videoEditor.diagnostics.keyDelete'),
    ArrowUp: translate('videoEditor.diagnostics.keyArrowUp'),
    ArrowDown: translate('videoEditor.diagnostics.keyArrowDown'),
    ArrowLeft: translate('videoEditor.diagnostics.keyArrowLeft'),
    ArrowRight: translate('videoEditor.diagnostics.keyArrowRight'),
  };

  if (specialKeys[normalizedKey] && !ctrlKey && !metaKey && !altKey) {
    return specialKeys[normalizedKey];
  }

  const modifiers = [ctrlKey || metaKey ? 'Ctrl' : null, altKey ? 'Alt' : null].filter(Boolean);
  if (modifiers.length > 0) {
    return `${translate('videoEditor.diagnostics.hotkeyPrefix')} ${[...modifiers, normalizedKey].join('+')}`;
  }

  return normalizedKey.length === 1
    ? `${translate('videoEditor.diagnostics.keyPressPrefix')} ${normalizedKey}`
    : `${translate('videoEditor.diagnostics.keyGenericPrefix')} ${normalizedKey}`;
}
