import { generateStableId } from '../../dom-utils/id-generator';
import {
  redactSensitiveAiFieldValue,
  shouldOmitAiFieldPayload,
} from '@sniptale/platform/security/ai-payload-privacy';
import { redactSensitiveString } from '@sniptale/platform/security/secret-redaction';
import {
  extractCleanText,
  extractLinkText,
  getSelector,
  setSniptaleId,
} from '../../dom-utils/dom-helpers';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../types';

const DYNAMIC_FIELD_LINK_MAX_LENGTH = 100_000;

export type DynamicIframeField = {
  id: string;
  label: string;
  linkRef?: string;
  sourceElement: HTMLElement;
  value: string;
  valueType: 'string' | 'link';
};

export function buildDynamicIframeFieldNodes(fields: DynamicIframeField[]): FieldNode[] {
  return fields.map((field): FieldNode => {
    const selector = getSelector(field.sourceElement);
    const value = redactSensitiveAiFieldValue({ label: field.label, value: field.value });
    const linkRef = shouldOmitAiFieldPayload({ label: field.label, value: field.value })
      ? undefined
      : field.linkRef === undefined
        ? undefined
        : redactSensitiveString(field.linkRef, DYNAMIC_FIELD_LINK_MAX_LENGTH);
    return {
      type: 'field',
      id: field.id,
      label: field.label,
      value,
      valueType: field.valueType,
      selector,
      selected: true,
      evidence: [{ confidence: 1, locator: selector, source: 'virtual-dom' }],
      ...(linkRef === undefined ? {} : { linkRef }),
    };
  });
}

function isElementNode(value: Element | null): value is HTMLElement {
  return value !== null && value.nodeType === Node.ELEMENT_NODE;
}

function hasVisibleText(element: HTMLElement): boolean {
  return Boolean(element.textContent?.trim());
}

function findDeepestValueNode(root: HTMLElement): HTMLElement | null {
  const descendants = Array.from(root.querySelectorAll<HTMLElement>('*')).reverse();
  return (
    descendants.find((candidate) => {
      return candidate.children.length === 0 && hasVisibleText(candidate);
    }) ?? null
  );
}

function resolveDynamicFieldValueTarget(fieldEl: Element): HTMLElement | null {
  const body = fieldEl.querySelector('.FormField-EA__fieldBody');
  if (!isElementNode(body)) {
    return null;
  }

  const link = body.querySelector('a');
  if (isElementNode(link)) {
    return link;
  }

  const preferredValueNode = body.querySelector(
    [
      '.DynamicValue__text',
      '.TreeSearchSelectField-EA__valueRow',
      '.TreeSearchSelectField-EA__value',
      '.stringView',
      '.yesNo',
      '.richTextPlainView',
      '.FormField-EA__control',
      'span',
      'p',
      'div',
    ].join(', ')
  );
  if (isElementNode(preferredValueNode)) {
    return findDeepestValueNode(preferredValueNode) ?? preferredValueNode;
  }

  return findDeepestValueNode(body) ?? body;
}

function resolveOriginalDynamicFieldTarget(
  fieldEl: Element,
  ctx: TraversalContext
): HTMLElement | null {
  const ownerDocument = fieldEl.ownerDocument;
  const originalField =
    (ctx.getOriginalElementFn?.(fieldEl) as HTMLElement | null) ||
    (fieldEl instanceof HTMLElement && fieldEl.id
      ? (ownerDocument.getElementById(fieldEl.id) as HTMLElement | null)
      : null);
  if (!originalField) {
    return null;
  }

  const originalValueTarget = resolveDynamicFieldValueTarget(originalField);
  return originalValueTarget ?? originalField;
}

function buildDynamicIframeField(
  fieldEl: Element,
  valueTarget: HTMLElement,
  label: string,
  value: string,
  linkRef: string | undefined,
  ctx: TraversalContext
): DynamicIframeField {
  const stableId = generateStableId('field', fieldEl as HTMLElement, ctx.globalFieldIndex);
  ctx.globalFieldIndex++;
  setSniptaleId(valueTarget, stableId);

  const originalValueTarget = resolveOriginalDynamicFieldTarget(fieldEl, ctx);
  if (originalValueTarget && originalValueTarget !== valueTarget) {
    setSniptaleId(originalValueTarget, stableId);
  }

  const safeValue = redactSensitiveAiFieldValue({ label, value });
  const safeLinkRef = shouldOmitAiFieldPayload({ label, value })
    ? undefined
    : linkRef === undefined
      ? undefined
      : redactSensitiveString(linkRef, DYNAMIC_FIELD_LINK_MAX_LENGTH);

  return {
    id: stableId,
    label,
    sourceElement: valueTarget,
    value: safeValue,
    valueType: linkRef ? 'link' : 'string',
    ...(safeLinkRef === undefined ? {} : { linkRef: safeLinkRef }),
  };
}

function parseDynamicIframeField(fieldEl: Element, ctx: TraversalContext) {
  const fieldInfo = fieldEl.querySelector('.FormField-EA__fieldInfo') as HTMLElement | null;
  const label =
    fieldInfo?.querySelector('span, label')?.textContent?.trim() ||
    (fieldInfo ? extractCleanText(fieldInfo) : '');
  const valueEl = resolveDynamicFieldValueTarget(fieldEl);
  const linkData = valueEl ? extractLinkText(valueEl) : null;
  const value = linkData?.text || valueEl?.textContent?.trim() || '';

  if (!label || !value || !valueEl) {
    return null;
  }

  return buildDynamicIframeField(fieldEl, valueEl, label, value, linkData?.href, ctx);
}

export function extractVirtualDynamicFieldsText(container: HTMLElement): string | null {
  try {
    const fields = Array.from(container.querySelectorAll('.FormField-EA__field'))
      .map((fieldEl) => {
        const label =
          fieldEl.querySelector('.FormField-EA__fieldInfo span')?.textContent?.trim() || '';
        const valueEl = fieldEl.querySelector('.FormField-EA__fieldBody');
        const value = valueEl ? extractLinkText(valueEl as HTMLElement).text : '';
        return label && value
          ? { label, value: redactSensitiveAiFieldValue({ label, value }) }
          : null;
      })
      .filter((field): field is { label: string; value: string } => field !== null);

    return fields.length > 0
      ? fields.map((field) => `${field.label}: ${field.value}`).join('\n')
      : null;
  } catch {
    return null;
  }
}

export function extractVirtualDynamicFieldsContent(
  container: HTMLElement,
  ctx: TraversalContext
): DynamicIframeField[] | null {
  try {
    const fields = Array.from(container.querySelectorAll('.FormField-EA__field'))
      .map((fieldEl) => parseDynamicIframeField(fieldEl, ctx))
      .filter((field): field is DynamicIframeField => field !== null);

    return fields.length > 0 ? fields : null;
  } catch {
    return null;
  }
}

export function extractDynamicFieldsContent(
  iframe: HTMLIFrameElement,
  ctx: TraversalContext
): DynamicIframeField[] | null {
  try {
    if (iframe.getAttribute('data-application-code') !== 'dynamicFields') {
      return null;
    }

    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!iframeDoc?.body) {
      return null;
    }

    const fields = Array.from(iframeDoc.querySelectorAll('.FormField-EA__field'))
      .map((fieldEl) => parseDynamicIframeField(fieldEl, ctx))
      .filter((field): field is DynamicIframeField => field !== null);

    return fields.length > 0 ? fields : null;
  } catch {
    return null;
  }
}
