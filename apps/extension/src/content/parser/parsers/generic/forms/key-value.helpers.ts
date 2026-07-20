import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { isRichTextEditorChromeElement } from '../../../rich-text-content';
import { extractCleanText, extractLinkText } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import { buildFieldNode, isExcludedFieldContainer, type FieldValueType } from './fields.helpers';
import { isPortalHomepage } from '../text/page-context.helpers';

const KEY_VALUE_SELECTORS = [
  '.field',
  '.form-field',
  '.form-group',
  '.property',
  '.item',
  '[class*="property"]',
  '.FormField-EA__field',
].join(', ');
const LABEL_SELECTORS = [
  '.label',
  '.field-label',
  '.form-label',
  'label',
  '.name',
  '.title',
  '.key',
  'dt',
  '[class*="label"]',
  '[class*="name"]',
  '.FormField-EA__fieldInfo span',
];
const VALUE_SELECTORS = [
  '.value',
  '.field-value',
  '.form-value',
  '.data',
  '.content',
  'dd',
  '[class*="value"]',
  '[class*="data"]',
  '.FormField-EA__fieldBody',
];

function findFirstUnprocessed(
  containerEl: Element,
  selectors: string[],
  processedElements: Set<Element>
) {
  for (const selector of selectors) {
    const element = containerEl.querySelector(selector);
    if (element && !processedElements.has(element)) {
      return element;
    }
  }

  return null;
}

function resolveFallbackChildren(containerEl: Element, processedElements: Set<Element>) {
  const children = Array.from(containerEl.children).filter(
    (child) =>
      !processedElements.has(child) &&
      !child.matches('script, style, svg, noscript') &&
      child.textContent?.trim()
  );

  if (children.length < 2) {
    return { labelEl: null, valueEl: null };
  }

  if (
    (containerEl as HTMLElement).closest('td.attrWide') ||
    (containerEl as HTMLElement).closest('table.attrList')
  ) {
    return { labelEl: null, valueEl: null };
  }

  return { labelEl: children[0], valueEl: children[1] };
}

function shouldSkipVirtualIframeField(container: HTMLElement, containerEl: Element) {
  const isContainerInVirtualIframe = container.closest('[data-virtual-iframe]') !== null;
  const isFieldInVirtualIframe =
    (containerEl as HTMLElement).closest('[data-virtual-iframe]') !== null;
  return !isContainerInVirtualIframe && isFieldInVirtualIframe;
}

function shouldSkipPortalPreviewField(containerEl: HTMLElement, ctx: TraversalContext) {
  if (!isPortalHomepage(ctx, containerEl)) {
    return false;
  }

  return (
    containerEl.matches('.ServiceCall__propertyContainer') ||
    Boolean(
      containerEl.closest('.ServiceCall__serviceCall, .SearchBlock__root, .Footer__footerBlock')
    )
  );
}

function shouldSkipProcessedKeyValueField(
  ctx: TraversalContext,
  labelEl: Element,
  valueEl: Element
) {
  if (
    ctx.processedFieldElements.has(labelEl as HTMLElement) ||
    ctx.processedFieldElements.has(valueEl as HTMLElement)
  ) {
    return true;
  }

  const labelId = (labelEl as HTMLElement).id || '';
  const valueId = (valueEl as HTMLElement).id || '';
  const isGwtCaptionOrValue =
    labelId.endsWith('-caption') ||
    labelId.endsWith('-value') ||
    valueId.endsWith('-caption') ||
    valueId.endsWith('-value');
  const isInsideAttrList =
    Boolean((labelEl as HTMLElement).closest('table.attrList')) ||
    Boolean((valueEl as HTMLElement).closest('table.attrList'));

  return isGwtCaptionOrValue && isInsideAttrList;
}

function resolveFieldPair(containerEl: Element, processedElements: Set<Element>) {
  let labelEl = findFirstUnprocessed(containerEl, LABEL_SELECTORS, processedElements);
  let valueEl = findFirstUnprocessed(containerEl, VALUE_SELECTORS, processedElements);

  if (!labelEl || !valueEl) {
    const fallback = resolveFallbackChildren(containerEl, processedElements);
    labelEl = fallback.labelEl ?? null;
    valueEl = fallback.valueEl ?? null;
  }

  return { labelEl, valueEl };
}

function resolveFieldValue(valueEl: HTMLElement) {
  const link = valueEl.querySelector('a');
  if (!link) {
    return {
      value: extractCleanText(valueEl),
      valueType: 'string' as FieldValueType,
    };
  }

  const linkData = extractLinkText(valueEl);
  return {
    linkRef: linkData.href,
    value: linkData.text,
    valueType: 'link' as FieldValueType,
  };
}

function parseKeyValueField(
  container: HTMLElement,
  containerEl: Element,
  ctx: TraversalContext,
  processedElements: Set<Element>
) {
  if (
    processedElements.has(containerEl) ||
    isExcludedFieldContainer(containerEl as HTMLElement) ||
    isRichTextEditorChromeElement(containerEl) ||
    shouldSkipPortalPreviewField(containerEl as HTMLElement, ctx) ||
    shouldSkipVirtualIframeField(container, containerEl) ||
    ctx.processedFieldElements.has(containerEl as HTMLElement)
  ) {
    return null;
  }

  const { labelEl, valueEl } = resolveFieldPair(containerEl, processedElements);
  if (
    !labelEl ||
    !valueEl ||
    isRichTextEditorChromeElement(labelEl) ||
    isRichTextEditorChromeElement(valueEl) ||
    shouldSkipProcessedKeyValueField(ctx, labelEl, valueEl)
  ) {
    return null;
  }

  const label = extractCleanText(labelEl as HTMLElement).replace(/[:\s]+$/, '');
  const { linkRef, value, valueType } = resolveFieldValue(valueEl as HTMLElement);
  if (!label || !value || label === value) {
    return null;
  }

  processedElements.add(labelEl);
  processedElements.add(valueEl);
  processedElements.add(containerEl);
  ctx.processedFieldElements.add(containerEl as HTMLElement);

  return buildFieldNode({
    ctx,
    label,
    linkRef,
    sourceElement: valueEl as HTMLElement,
    value,
    valueType,
  });
}

export function parseKeyValueFields(
  container: HTMLElement,
  ctx: TraversalContext,
  processedElements: Set<Element>
): FieldNode[] {
  return Array.from(container.querySelectorAll(KEY_VALUE_SELECTORS))
    .map((containerEl) => parseKeyValueField(container, containerEl, ctx, processedElements))
    .filter((field): field is FieldNode => field !== null);
}
