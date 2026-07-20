import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  determineValueType,
  extractCleanText,
  extractLinkText,
} from '../../../dom-utils/dom-helpers';
import {
  extractVirtualIframeContent,
  resolveWideAttributeFrame,
} from '../../gwt/attr-list-wide.helpers';
import { DOMParser, type ParserResult, type TraversalContext } from '../../types';
import { buildFieldNode } from '../forms/fields.helpers';
import { ensureTitledSection } from '../text/sections.helpers';

function resolveDetailsSectionTitle(element: HTMLElement) {
  const blockTitle = element
    .closest('.Block__block, .Details__additionalRequest')
    ?.querySelector(
      [
        '.CollapsibleBlock__groupTitle span',
        '.CollapsibleBlock__groupTitle',
        '.Title__title',
        '.DetailsHead__serviceTitle',
        '.DetailsHead__routeTitle',
      ].join(', ')
    );

  const title = blockTitle instanceof HTMLElement ? extractCleanText(blockTitle) : '';
  return title || 'Детали';
}

function resolveDetailsValue(valueCell: HTMLElement) {
  const frameData = resolveWideAttributeFrame(valueCell);
  if (frameData.iframeContainer && frameData.isVirtualIframe) {
    return {
      linkRef: undefined,
      value: extractVirtualIframeContent(frameData.iframeContainer) || '',
      valueType: 'string' as const,
    };
  }

  const valueType = determineValueType(valueCell);
  if (valueType === 'link') {
    const linkData = extractLinkText(valueCell);
    return {
      linkRef: linkData.href,
      value: linkData.text,
      valueType,
    };
  }

  return {
    linkRef: undefined,
    value: extractCleanText(valueCell),
    valueType,
  };
}

function parseDetailsRow(row: HTMLElement, ctx: TraversalContext) {
  if (ctx.processedFieldElements.has(row)) {
    return null;
  }

  const columns = Array.from(row.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement
  );
  if (columns.length < 2) {
    return null;
  }

  const labelCell = columns[0];
  const valueCell = columns[1];
  if (!labelCell || !valueCell) {
    return null;
  }

  const label = extractCleanText(labelCell).replace(/[:\s]+$/, '');
  const resolved = resolveDetailsValue(valueCell);
  if (!label || !resolved.value || label === resolved.value) {
    return null;
  }

  ctx.processedFieldElements.add(row);
  ctx.processedFieldElements.add(labelCell);
  ctx.processedFieldElements.add(valueCell);

  return buildFieldNode({
    ctx,
    label,
    sourceElement: valueCell,
    value: resolved.value,
    valueType: resolved.valueType,
    linkRef: resolved.linkRef,
  });
}

export class DetailsHierarchicalTableParser extends DOMParser {
  name = 'DetailsHierarchicalTable';
  priority = 18;

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    return (
      element.matches('.Details__hierarchicalTable') &&
      !ctx.processedFieldElements.has(element) &&
      element.querySelector('.Details__row > .Details__colPage') !== null
    );
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    const section = ensureTitledSection({
      ctx,
      title: resolveDetailsSectionTitle(element),
    });
    const rows: FieldNode[] = Array.from(element.querySelectorAll(':scope > .Details__row'))
      .map((row) => parseDetailsRow(row as HTMLElement, ctx))
      .filter((field): field is FieldNode => field !== null);

    ctx.processedFieldElements.add(element);

    if (rows.length === 0) {
      return {};
    }

    section.children.push(...rows);
    return { fields: rows };
  }
}
