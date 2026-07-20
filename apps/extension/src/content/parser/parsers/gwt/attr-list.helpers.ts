import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { generateStableId } from '../../dom-utils/id-generator';
import {
  determineValueType,
  extractCleanText,
  extractImageText,
  extractLinkText,
  getSelector,
  isElementVisible,
  setSniptaleId,
} from '../../dom-utils/dom-helpers';
import type { TraversalContext } from '../types';
import {
  buildIframeFallbackWideField,
  buildRealIframeWideFields,
  buildVirtualWideField,
  markWideAttributeElementsProcessed,
  resolveVirtualWideEmbeddedText,
  resolveWideAttributeFrame,
  buildWideAttributeField,
} from './attr-list-wide.helpers';

function parseWideAttributeIframe(
  ctx: TraversalContext,
  wideCell: HTMLElement,
  valueEl: HTMLElement,
  label: string,
  iframeContainer: HTMLElement,
  isVirtualIframe: boolean,
  captionEl?: Element | null
) {
  if (isVirtualIframe) {
    const embeddedText = resolveVirtualWideEmbeddedText(iframeContainer);
    if (embeddedText?.trim() && label) {
      return buildVirtualWideField(ctx, wideCell, valueEl, label, embeddedText, captionEl);
    }
  }

  if (!isVirtualIframe) {
    const fields = buildRealIframeWideFields(
      ctx,
      wideCell,
      valueEl,
      label,
      iframeContainer,
      captionEl
    );
    if (fields !== null) {
      return fields;
    }
  }

  if (!label) {
    return [];
  }

  return buildIframeFallbackWideField(
    ctx,
    wideCell,
    valueEl,
    label,
    iframeContainer,
    isVirtualIframe,
    captionEl
  );
}

function parseWideAttribute(wideCell: HTMLElement, ctx: TraversalContext): FieldNode[] {
  const captionEl = wideCell.querySelector('[id$="-caption"]');
  const valueEl = wideCell.querySelector('[id$="-value"], .richTextWideView') as HTMLElement | null;
  if (!valueEl) {
    return [];
  }

  const label =
    extractCleanText(captionEl as HTMLElement).replace(/[:\s]+$/, '') ||
    ((valueEl.id || '')
      .match(/gwt-debug-(.+)-value$/)?.[1]
      ?.replace(/([A-Z])/g, ' $1')
      .trim() ??
      '');

  const frameData = resolveWideAttributeFrame(valueEl);
  if (frameData.iframeContainer) {
    return parseWideAttributeIframe(
      ctx,
      wideCell,
      valueEl,
      label,
      frameData.iframeContainer,
      frameData.isVirtualIframe,
      captionEl
    );
  }

  const value = extractCleanText(valueEl);
  if (
    !label ||
    !value ||
    label.replace(/[:\s]+$/, '').toLowerCase() === value.replace(/[:\s]+$/, '').toLowerCase()
  ) {
    return [];
  }

  markWideAttributeElementsProcessed(ctx, wideCell, valueEl, null, captionEl);
  return [buildWideAttributeField(ctx, valueEl, label, value)];
}

function parseStandardAttributeRow(
  _attrList: HTMLTableElement,
  row: HTMLTableRowElement,
  ctx: TraversalContext
) {
  const titleCell = row.querySelector('.attrTitle, td:first-child');
  const valueCell = row.querySelector('.attrValue, td:last-child') as HTMLElement | null;
  if (!titleCell || !valueCell) {
    return null;
  }

  const label = extractCleanText(titleCell as HTMLElement).replace(/[:\s]+$/, '');
  const valueType = determineValueType(valueCell);
  const linkData = valueType === 'link' ? extractLinkText(valueCell) : null;
  const value =
    valueType === 'link'
      ? linkData?.text || ''
      : valueType === 'string'
        ? extractImageText(valueCell)
        : extractCleanText(valueCell);

  if (!label || !value || ctx.processedFieldElements.has(valueCell)) {
    return null;
  }

  const stableId = generateStableId('field', valueCell, ctx.globalFieldIndex);
  ctx.globalFieldIndex++;
  setSniptaleId(valueCell, stableId);
  ctx.processedFieldElements.add(valueCell);

  return {
    type: 'field' as const,
    id: stableId,
    label,
    value,
    valueType,
    selector: getSelector(valueCell),
    selected: true,
    ...(linkData?.href === undefined ? {} : { linkRef: linkData.href }),
  };
}

export function parseAttributes(attrList: HTMLTableElement, ctx: TraversalContext): FieldNode[] {
  const tbody = attrList.querySelector(':scope > tbody');
  if (!tbody) {
    return [];
  }

  return Array.from(tbody.children)
    .filter((child) => child.tagName === 'TR' && isElementVisible(child as HTMLElement))
    .flatMap((row) => {
      const wideCell = row.querySelector(':scope > td.attrWide') as HTMLElement | null;
      if (wideCell) {
        return parseWideAttribute(wideCell, ctx);
      }

      const field = parseStandardAttributeRow(attrList, row as HTMLTableRowElement, ctx);
      return field ? [field] : [];
    });
}
