import { CONTENT_ROOT_ID } from '@sniptale/ui/branding';
import { sanitizeDiagnosticData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { buildVirtualDomSnapshot } from '../../../parser/dom-tree-parser/traversal';
import {
  resolveDiagnosticsDocument,
  type ExportDiagnosticsSource,
} from '../../../parser/export-manager/diagnostics/source';
import { isRetainedUrlAttributeName, sanitizeUrlAttributes } from './page-snapshot.url-attributes';

const BLANKED_TEXT_ATTRIBUTE_NAMES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'content',
  'label',
  'placeholder',
  'title',
]);
const BOOLEAN_ATTRIBUTE_NAMES = new Set([
  'autofocus',
  'checked',
  'controls',
  'default',
  'disabled',
  'hidden',
  'inert',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);
const NUMERIC_ATTRIBUTE_NAMES = new Set(['colspan', 'rowspan', 'span']);
const PRESENT_ONLY_ATTRIBUTE_NAMES = new Set([
  'cols',
  'height',
  'max',
  'maxlength',
  'min',
  'minlength',
  'rows',
  'size',
  'step',
  'width',
]);
const TOKEN_ATTRIBUTE_NAMES = new Set([
  'crossorigin',
  'decoding',
  'enctype',
  'inputmode',
  'loading',
  'method',
  'referrerpolicy',
  'rel',
  'scope',
  'target',
]);
const SAFE_ARIA_STATE_ATTRIBUTE_NAMES = new Set([
  'aria-busy',
  'aria-checked',
  'aria-current',
  'aria-disabled',
  'aria-expanded',
  'aria-haspopup',
  'aria-hidden',
  'aria-invalid',
  'aria-live',
  'aria-modal',
  'aria-multiline',
  'aria-multiselectable',
  'aria-orientation',
  'aria-pressed',
  'aria-readonly',
  'aria-required',
  'aria-selected',
  'aria-sort',
]);
const SAFE_VIRTUAL_MARKER_VALUES = new Set(['false', 'true']);
const SAFE_NORMALIZED_KIND_VALUES = new Set(['callout', 'code', 'heading', 'list', 'quote']);
const SAFE_TYPE_VALUES = new Set([
  'button',
  'checkbox',
  'color',
  'date',
  'datetime-local',
  'email',
  'file',
  'hidden',
  'image',
  'month',
  'number',
  'password',
  'radio',
  'range',
  'reset',
  'search',
  'submit',
  'tel',
  'text',
  'time',
  'url',
  'week',
]);
const SAFE_ROLE_VALUES = new Set([
  'alert',
  'article',
  'button',
  'cell',
  'checkbox',
  'columnheader',
  'dialog',
  'document',
  'form',
  'grid',
  'gridcell',
  'group',
  'heading',
  'img',
  'link',
  'list',
  'listbox',
  'listitem',
  'main',
  'menu',
  'menuitem',
  'navigation',
  'option',
  'progressbar',
  'radio',
  'region',
  'row',
  'rowgroup',
  'rowheader',
  'search',
  'separator',
  'slider',
  'status',
  'switch',
  'tab',
  'table',
  'tablist',
  'tabpanel',
  'textbox',
  'timer',
  'toolbar',
  'tooltip',
  'tree',
  'treeitem',
]);
const SAFE_ARIA_STATE_VALUES = new Set([
  'ascending',
  'assertive',
  'both',
  'descending',
  'false',
  'grammar',
  'horizontal',
  'inline',
  'location',
  'mixed',
  'none',
  'off',
  'page',
  'polite',
  'spelling',
  'step',
  'text',
  'true',
  'undefined',
  'vertical',
]);
type AttributeValueDecision = string | null | undefined;
type AttributeValuePolicy = (normalizedName: string, value: string) => AttributeValueDecision;

function isAsciiLetter(character: string): boolean {
  const code = character.charCodeAt(0);
  return (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isAsciiDigit(character: string): boolean {
  const code = character.charCodeAt(0);
  return code >= 48 && code <= 57;
}

function isAsciiAlphaNumeric(character: string): boolean {
  return isAsciiLetter(character) || isAsciiDigit(character);
}

function isSafeLanguageAttributeValue(value: string): boolean {
  const segments = value.split('-');
  const primary = segments[0];
  if (primary === undefined || primary.length < 2 || primary.length > 3) {
    return false;
  }
  if (!Array.from(primary).every(isAsciiLetter)) {
    return false;
  }
  if (segments.length > 3) {
    return false;
  }

  return segments
    .slice(1)
    .every(
      (segment) =>
        segment.length >= 2 && segment.length <= 8 && Array.from(segment).every(isAsciiAlphaNumeric)
    );
}

function isSafeNumberAttributeValue(value: string): boolean {
  const unsigned = value.startsWith('-') ? value.slice(1) : value;
  const parts = unsigned.split('.');
  const whole = parts[0];
  const fraction = parts[1];

  if (whole === undefined || whole.length === 0 || whole.length > 6) {
    return false;
  }
  if (parts.length > 2 || !Array.from(whole).every(isAsciiDigit)) {
    return false;
  }

  return (
    fraction === undefined ||
    (fraction.length >= 1 && fraction.length <= 3 && Array.from(fraction).every(isAsciiDigit))
  );
}

function buildScriptPlaceholder(script: HTMLScriptElement): string {
  const textLength = script.textContent?.trim().length ?? 0;
  const scriptType = script.getAttribute('type') ?? 'text/javascript';

  return `[script:${scriptType}:${textLength}]`;
}

function isCanonicalSecretAttribute(attributeName: string): boolean {
  const sanitized = sanitizeDiagnosticData({ [attributeName]: 'retained-value' });
  return (
    typeof sanitized === 'object' &&
    sanitized !== null &&
    !Array.isArray(sanitized) &&
    (sanitized as Record<string, unknown>)[attributeName] === '***'
  );
}

function matchSetValue(
  names: ReadonlySet<string>,
  normalizedName: string,
  value: string
): AttributeValueDecision {
  return names.has(normalizedName) ? value : undefined;
}

function matchSafeSetValue(
  names: ReadonlySet<string>,
  allowedValues: ReadonlySet<string>,
  normalizedName: string,
  value: string
): AttributeValueDecision {
  if (!names.has(normalizedName)) {
    return undefined;
  }

  const normalizedValue = value.toLowerCase();
  return allowedValues.has(normalizedValue) ? normalizedValue : '';
}

function minimizeScalarAttribute(normalizedName: string, value: string): AttributeValueDecision {
  if (normalizedName === 'lang') {
    return isSafeLanguageAttributeValue(value) ? value : '';
  }
  if (normalizedName === 'class') {
    const tokenCount = value.trim().split(/\s+/).filter(Boolean).length;
    return `[tokens:${tokenCount}]`;
  }

  return undefined;
}

function minimizeNamedAttribute(normalizedName: string, value: string): AttributeValueDecision {
  if (normalizedName === 'type') {
    return matchSafeSetValue(new Set(['type']), SAFE_TYPE_VALUES, normalizedName, value);
  }
  if (normalizedName === 'role') {
    return matchSafeSetValue(new Set(['role']), SAFE_ROLE_VALUES, normalizedName, value);
  }
  if (normalizedName === 'dir') {
    return matchSafeSetValue(
      new Set(['dir']),
      new Set(['ltr', 'rtl', 'auto']),
      normalizedName,
      value
    );
  }

  return undefined;
}

const ATTRIBUTE_VALUE_POLICIES: readonly AttributeValuePolicy[] = [
  (normalizedName) => matchSetValue(BLANKED_TEXT_ATTRIBUTE_NAMES, normalizedName, ''),
  (normalizedName, value) => (isRetainedUrlAttributeName(normalizedName) ? value : undefined),
  (normalizedName) => matchSetValue(BOOLEAN_ATTRIBUTE_NAMES, normalizedName, ''),
  (normalizedName, value) =>
    NUMERIC_ATTRIBUTE_NAMES.has(normalizedName)
      ? isSafeNumberAttributeValue(value)
        ? value
        : ''
      : undefined,
  (normalizedName) => matchSetValue(PRESENT_ONLY_ATTRIBUTE_NAMES, normalizedName, '[present]'),
  (normalizedName) => matchSetValue(TOKEN_ATTRIBUTE_NAMES, normalizedName, '[present]'),
  (normalizedName, value) =>
    matchSafeSetValue(
      SAFE_ARIA_STATE_ATTRIBUTE_NAMES,
      SAFE_ARIA_STATE_VALUES,
      normalizedName,
      value
    ),
  minimizeNamedAttribute,
  minimizeScalarAttribute,
  (normalizedName) =>
    matchSetValue(
      new Set(['id', 'name', 'autocomplete', 'data-iframe-source']),
      normalizedName,
      '[present]'
    ),
  (normalizedName, value) =>
    matchSafeSetValue(
      new Set(['data-virtual-iframe']),
      SAFE_VIRTUAL_MARKER_VALUES,
      normalizedName,
      value
    ),
  (normalizedName, value) =>
    matchSafeSetValue(
      new Set(['data-sc-normalized-kind']),
      SAFE_NORMALIZED_KIND_VALUES,
      normalizedName,
      value
    ),
];

function resolveMinimizedAttributeValue(normalizedName: string, value: string): string | null {
  for (const policy of ATTRIBUTE_VALUE_POLICIES) {
    const decision = policy(normalizedName, value);
    if (decision !== undefined) {
      return decision;
    }
  }

  return null;
}

function minimizeAttributeValue(element: HTMLElement, attributeName: string): void {
  const normalizedName = attributeName.toLowerCase();
  const value = element.getAttribute(attributeName) ?? '';
  if (
    element instanceof SVGElement &&
    (normalizedName === 'width' || normalizedName === 'height')
  ) {
    element.setAttribute(attributeName, '0');
    return;
  }
  const minimizedValue = resolveMinimizedAttributeValue(normalizedName, value);

  if (minimizedValue !== null) {
    element.setAttribute(attributeName, minimizedValue);
    return;
  }

  element.removeAttribute(attributeName);
}

function sanitizeAttributes(element: HTMLElement): void {
  for (const attribute of Array.from(element.attributes)) {
    const normalizedName = attribute.name.toLowerCase();
    if (normalizedName.startsWith('on') || isCanonicalSecretAttribute(normalizedName)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    minimizeAttributeValue(element, attribute.name);
  }

  sanitizeUrlAttributes(element);
}

function redactTextNodes(root: HTMLElement, documentRoot: Document): void {
  const nodeFilter = documentRoot.defaultView?.NodeFilter ?? NodeFilter;
  const walker = documentRoot.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;
    const normalizedText = textNode.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    textNode.textContent = normalizedText.length > 0 ? `[text:${normalizedText.length}]` : '';
    currentNode = walker.nextNode();
  }
}

function redactDomSnapshot(root: HTMLElement, documentRoot: Document): void {
  root.querySelectorAll(`#${CONTENT_ROOT_ID}`).forEach((node) => node.remove());
  [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    sanitizeAttributes(element);

    if (element instanceof HTMLScriptElement) {
      element.textContent = buildScriptPlaceholder(element);
      return;
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = '';
      return;
    }

    if (element instanceof HTMLOptionElement) {
      element.textContent = '';
      element.value = '';
    }
  });
  redactTextNodes(root, documentRoot);
}

function buildHtmlSnapshot(root: HTMLElement, documentRoot: Document): string {
  const doctype = documentRoot.doctype
    ? `<!DOCTYPE ${documentRoot.doctype.name}>`
    : '<!DOCTYPE html>';
  return `${doctype}\n${root.outerHTML}`;
}

export function buildDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  const documentRoot = resolveDiagnosticsDocument(source);
  const clone = documentRoot.documentElement.cloneNode(true) as HTMLElement;
  redactDomSnapshot(clone, documentRoot);
  return buildHtmlSnapshot(clone, documentRoot);
}

export function buildVirtualDomSnapshotHtml(source?: ExportDiagnosticsSource): string {
  const documentRoot = resolveDiagnosticsDocument(source);
  const clone = documentRoot.documentElement.cloneNode(true) as HTMLElement;
  const virtualBody = buildVirtualDomSnapshot({
    documentRoot,
    root: documentRoot.body ?? documentRoot.documentElement,
  }).root;
  const clonedBody = clone.querySelector('body');
  redactDomSnapshot(clone, documentRoot);

  if (clonedBody) {
    clonedBody.replaceWith(virtualBody);
  } else {
    clone.append(virtualBody);
  }

  redactDomSnapshot(clone, documentRoot);
  return buildHtmlSnapshot(clone, documentRoot);
}
