import { generateStableId } from '../../dom-utils/id-generator';
import { getSelector, setSniptaleId } from '../../dom-utils/dom-helpers';
import type { EvidenceRefSource, FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import type { TraversalContext } from '../types';
import {
  buildDynamicIframeFieldNodes,
  type DynamicIframeField,
  extractDynamicFieldsContent,
  extractVirtualDynamicFieldsText,
} from './attr-list-dynamic-fields.helpers';
import {
  extractFroalaIframeContent,
  extractRichTextIframeContent,
} from './rich-text-iframe.helpers';

function isDynamicFieldsVirtualContainer(container: HTMLElement, body: HTMLElement): boolean {
  return (
    container.getAttribute('data-application-code') === 'dynamicFields' ||
    Boolean(container.querySelector('[data-application-code="dynamicFields"]')) ||
    Boolean(body.querySelector('.FormField-EA__field'))
  );
}

export function extractVirtualIframeContent(container: HTMLElement): string | null {
  try {
    const body = (container.querySelector('body') || container) as HTMLElement;
    const isDynamicFields = isDynamicFieldsVirtualContainer(container, body);

    if (isDynamicFields) {
      return extractVirtualDynamicFieldsText(body);
    }

    return extractRichTextIframeContent(body, { removeHidden: true })?.text ?? null;
  } catch {
    return null;
  }
}

export function extractFroalaContentSync(iframe: HTMLIFrameElement | HTMLElement) {
  return extractFroalaIframeContent(iframe, { removeHidden: true });
}

export function resolveVirtualWideEmbeddedText(iframeContainer: HTMLElement): string | null {
  const body = (iframeContainer.querySelector('body') || iframeContainer) as HTMLElement;
  const embeddedContent = isDynamicFieldsVirtualContainer(iframeContainer, body)
    ? extractVirtualIframeContent(iframeContainer)
    : extractFroalaContentSync(iframeContainer);

  return typeof embeddedContent === 'string' ? embeddedContent : (embeddedContent?.text ?? null);
}

export function resolveWideAttributeFrame(valueEl: HTMLElement) {
  const realIframe = valueEl.querySelector('iframe') as HTMLElement | null;
  if (realIframe) {
    return { iframeContainer: realIframe, isVirtualIframe: false };
  }

  const virtualIframe =
    (valueEl.querySelector('[data-virtual-iframe]') as HTMLElement | null) ||
    (valueEl.querySelector('div[id^="iframe$"]') as HTMLElement | null) ||
    ((valueEl.querySelector('[data-iframe-source]')?.closest('div') as HTMLElement | null) ?? null);

  return { iframeContainer: virtualIframe, isVirtualIframe: Boolean(virtualIframe) };
}

export function buildWideAttributeFallbackValue(
  iframeContainer: HTMLElement,
  isVirtualIframe: boolean
) {
  const iframeSrc = (iframeContainer as HTMLIFrameElement).src || '';
  const iframeId = iframeContainer.id || '';

  if (
    iframeSrc.includes('dynamicFields') ||
    iframeContainer.hasAttribute('data-application-code')
  ) {
    return `[Embedded App: ${iframeContainer.getAttribute('data-application-code') || 'unknown'}]`;
  }

  if (iframeSrc.includes('richText') || iframeId.includes('iframe$') || isVirtualIframe) {
    const uuidMatch = iframeSrc.match(/uuid=([^&]+)/);
    return uuidMatch
      ? `[Froala Editor - uuid: ${uuidMatch[1]}]`
      : '[Froala Editor - содержимое недоступно]';
  }

  return `[Содержимое в iframe: ${iframeId || iframeSrc.substring(0, 50)}]`;
}

export function buildWideAttributeField(
  ctx: TraversalContext,
  valueEl: HTMLElement,
  label: string,
  value: string,
  options: { evidenceSource?: EvidenceRefSource } = {}
): FieldNode {
  const stableId = generateStableId('field', valueEl, ctx.globalFieldIndex);
  const selector = getSelector(valueEl);
  ctx.globalFieldIndex++;
  setSniptaleId(valueEl, stableId);

  return {
    type: 'field' as const,
    id: stableId,
    label,
    value,
    valueType: 'string' as const,
    selector,
    selected: true,
    ...(options.evidenceSource === undefined
      ? {}
      : { evidence: [{ confidence: 1, locator: selector, source: options.evidenceSource }] }),
  };
}

export function markWideAttributeElementsProcessed(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  iframeContainer?: HTMLElement | null,
  captionEl?: Element | null
) {
  if (captionEl) {
    ctx.processedFieldElements.add(captionEl as HTMLElement);
  }

  ctx.processedFieldElements.add(valueEl);
  ctx.processedFieldElements.add(wideCell);

  if (iframeContainer) {
    ctx.processedFieldElements.add(iframeContainer);
    Array.from(iframeContainer.querySelectorAll('*')).forEach((child) => {
      ctx.processedFieldElements.add(child as HTMLElement);
    });
  }
}

export function buildVirtualWideField(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  label: string,
  embeddedContent: string,
  captionEl?: Element | null
) {
  markWideAttributeElementsProcessed(ctx, wideCell, valueEl, null, captionEl);
  const field = buildWideAttributeField(ctx, valueEl, label, embeddedContent, {
    evidenceSource: 'virtual-dom',
  });
  wideCell.setAttribute('data-sniptale-id', `${field.id}_wide`);
  return [field];
}

function buildDynamicWideFields(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  dynamicFields: DynamicIframeField[],
  iframeContainer: HTMLElement,
  captionEl?: Element | null
) {
  markWideAttributeElementsProcessed(ctx, wideCell, valueEl, iframeContainer, captionEl);
  return buildDynamicIframeFieldNodes(dynamicFields);
}

export function buildRealIframeWideFields(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  label: string,
  iframeContainer: HTMLElement,
  captionEl?: Element | null
) {
  const dynamicFields = extractDynamicFieldsContent(iframeContainer as HTMLIFrameElement, ctx);
  if (dynamicFields?.length) {
    return buildDynamicWideFields(
      ctx,
      wideCell,
      valueEl,
      dynamicFields,
      iframeContainer,
      captionEl
    );
  }

  const froalaContent = extractFroalaContentSync(iframeContainer as HTMLIFrameElement);
  if (!froalaContent?.text.trim() || !label) {
    return null;
  }

  markWideAttributeElementsProcessed(ctx, wideCell, valueEl, null, captionEl);
  return [
    buildWideAttributeField(ctx, valueEl, label, froalaContent.text, {
      evidenceSource: 'virtual-dom',
    }),
  ];
}

export function buildIframeFallbackWideField(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  label: string,
  iframeContainer: HTMLElement,
  isVirtualIframe: boolean,
  captionEl?: Element | null
) {
  markWideAttributeElementsProcessed(ctx, wideCell, valueEl, iframeContainer, captionEl);
  return [
    buildWideAttributeField(
      ctx,
      valueEl,
      label,
      buildWideAttributeFallbackValue(iframeContainer, isVirtualIframe),
      { evidenceSource: 'virtual-dom' }
    ),
  ];
}
