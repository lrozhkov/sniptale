import { translate } from '../../../platform/i18n';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';
import type { ElementRole, TargetData } from './types';

function getRoleLabel(role: ElementRole): string {
  switch (role) {
    case 'unknown':
      return '';
    case 'button':
      return translate('videoEditor.diagnostics.roleButton');
    case 'link':
      return translate('videoEditor.diagnostics.roleLink');
    case 'input':
      return translate('videoEditor.diagnostics.roleInput');
    case 'checkbox':
      return translate('videoEditor.diagnostics.roleCheckbox');
    case 'radio':
      return translate('videoEditor.diagnostics.roleRadio');
    case 'select':
      return translate('videoEditor.diagnostics.roleSelect');
    case 'tab':
      return translate('videoEditor.diagnostics.roleTab');
    case 'menu':
      return translate('videoEditor.diagnostics.roleMenu');
    case 'menuitem':
      return translate('videoEditor.diagnostics.roleMenuItem');
    case 'icon':
      return translate('videoEditor.diagnostics.roleIcon');
    case 'text':
      return translate('videoEditor.diagnostics.roleText');
    case 'image':
      return translate('videoEditor.diagnostics.roleImage');
  }

  return '';
}

function classifyAriaRole(role: string | undefined): ElementRole | null {
  if (!role) {
    return null;
  }

  switch (role) {
    case 'button':
    case 'link':
    case 'tab':
    case 'menu':
    case 'menuitem':
    case 'checkbox':
    case 'radio':
      return role;
    default:
      return null;
  }
}

function classifyTagName(tagName: string, type: string | undefined): ElementRole | null {
  if (tagName === 'button') return 'button';
  if (tagName === 'a') return 'link';
  if (tagName === 'select') return 'select';
  if (tagName === 'textarea') return 'input';
  if (tagName === 'input') {
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    return 'input';
  }
  if (tagName === 'p' || tagName === 'span' || tagName === 'div') return 'text';
  if (tagName === 'img') return 'image';
  return null;
}

function classifyClassName(className: string): ElementRole | null {
  if (
    className.includes('button') ||
    className.includes('gwt-button') ||
    className.includes('btn')
  ) {
    return 'button';
  }
  if (className.includes('tab') || className.includes('gwt-tab')) return 'tab';
  if (className.includes('menu-item') || className.includes('menuitem')) return 'menuitem';
  if (
    className.includes('icon') ||
    className.includes('vectoricon') ||
    className.includes('gwt-html')
  ) {
    return 'icon';
  }
  return null;
}

export function classifyElement(data: TargetData): ElementRole {
  const tagName = data.tagName?.toLowerCase() || '';
  const role = data.role?.toLowerCase();
  const type = data.type?.toLowerCase();
  const className = data.className?.toLowerCase() || '';
  return (
    classifyAriaRole(role) ??
    classifyClassName(className) ??
    classifyTagName(tagName, type) ??
    'unknown'
  );
}

export function getElementText(data: TargetData, role: ElementRole): string {
  const maxLen = 50;

  if (data.ariaLabel?.trim()) return truncateText(data.ariaLabel.trim(), maxLen);
  if (data.title?.trim()) return truncateText(data.title.trim(), maxLen);
  if (data.text?.trim()) return truncateText(data.text.trim(), maxLen);
  if (data.placeholder?.trim()) return truncateText(data.placeholder.trim(), maxLen);
  if (data.value?.trim() && role === 'input') return truncateText(data.value.trim(), maxLen);

  if (data.href && role === 'link') {
    try {
      const url = new URL(data.href);
      return url.pathname.slice(0, maxLen) || url.hostname;
    } catch {
      return truncateText(data.href, maxLen);
    }
  }

  return `${translate('videoEditor.diagnostics.noTextFallbackPrefix')} (${data.tagName || 'element'}${
    data.id ? `#${data.id}` : ''
  })`;
}

export function formatClickAction(data: TargetData): string {
  const role = classifyElement(data);
  const text = getElementText(data, role);
  const roleLabel = getRoleLabel(role);

  return roleLabel
    ? `${translate('videoEditor.diagnostics.clickPrefix')} "${text}" (${roleLabel})`
    : `${translate('videoEditor.diagnostics.clickPrefix')} "${text}"`;
}

export function formatKeydownAction(data: {
  key?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): string {
  const { key = '', ctrlKey, metaKey, altKey, shiftKey } = data;
  const normalizedKey = normalizeHotkeyKey(key);

  if (!ctrlKey && !metaKey && !altKey) {
    switch (normalizedKey) {
      case 'Enter':
        return translate('videoEditor.diagnostics.keyEnter');
      case 'Escape':
        return translate('videoEditor.diagnostics.keyEscape');
      case 'Tab':
        return translate('videoEditor.diagnostics.keyTab');
      case 'Backspace':
        return translate('videoEditor.diagnostics.keyBackspace');
      case 'Delete':
        return translate('videoEditor.diagnostics.keyDelete');
      case 'ArrowUp':
        return translate('videoEditor.diagnostics.keyArrowUp');
      case 'ArrowDown':
        return translate('videoEditor.diagnostics.keyArrowDown');
      case 'ArrowLeft':
        return translate('videoEditor.diagnostics.keyArrowLeft');
      case 'ArrowRight':
        return translate('videoEditor.diagnostics.keyArrowRight');
      default:
        break;
    }
  }

  const modifiers: string[] = [];
  if (ctrlKey || metaKey) modifiers.push('Ctrl');
  if (altKey) modifiers.push('Alt');
  if (shiftKey) modifiers.push('Shift');

  if (modifiers.length > 0) {
    return `${translate('videoEditor.diagnostics.hotkeyPrefix')} ${[...modifiers, normalizedKey].join('+')}`;
  }

  if (normalizedKey.length === 1) {
    return `${translate('videoEditor.diagnostics.keyPressPrefix')} ${normalizedKey}`;
  }

  return `${translate('videoEditor.diagnostics.keyGenericPrefix')} ${normalizedKey}`;
}

export function formatScrollAction(data: { direction?: 'up' | 'down' }): string {
  return data.direction === 'up'
    ? translate('videoEditor.diagnostics.scrollUp')
    : translate('videoEditor.diagnostics.scrollDown');
}

export function formatInputAction(data: TargetData): string {
  return `${translate('videoEditor.diagnostics.textInputPrefix')} "${getElementText(
    data,
    classifyElement(data)
  )}"`;
}

export function formatChangeAction(data: TargetData): string {
  return `${translate('videoEditor.diagnostics.changePrefix')} "${getElementText(
    data,
    classifyElement(data)
  )}"`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}
