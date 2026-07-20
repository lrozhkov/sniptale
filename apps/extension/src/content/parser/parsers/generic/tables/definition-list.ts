/**
 * Generic Definition List Parser
 * Parses <dl><dt>Label</dt><dd>Value</dd></dl> structures
 * Commonly used on Wikipedia and documentation sites
 */

import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { DOMParser, type TraversalContext, type ParserResult } from '../../types';
import { generateStableId, generateId } from '../../../dom-utils/id-generator';
import {
  extractCleanText,
  extractLinkText,
  getSelector,
  setSniptaleId,
} from '../../../dom-utils/dom-helpers';

/**
 * Parses definition list into fields
 */
function parseDefinitionList(dl: HTMLDListElement, ctx: TraversalContext): FieldNode[] {
  const fields: FieldNode[] = [];
  const dts = dl.querySelectorAll(':scope > dt');
  const dds = dl.querySelectorAll(':scope > dd');

  dts.forEach((dt, i) => {
    const label = extractCleanText(dt as HTMLElement).replace(/[:\s]+$/, '');
    const dd = dds[i];

    if (!dd) return;

    const valueEl = dd as HTMLElement;
    let value: string;
    let linkRef: string | undefined;
    let valueType: 'string' | 'link' | 'number' | 'boolean' = 'string';

    // Check for link
    const link = dd.querySelector('a');
    if (link) {
      const linkData = extractLinkText(valueEl);
      value = linkData.text;
      linkRef = linkData.href;
      valueType = 'link';
    } else {
      value = extractCleanText(valueEl);
    }

    if (!label || !value) return;
    if (label.toLowerCase() === value.toLowerCase()) return;

    const stableId = generateStableId('field', valueEl, ctx.globalFieldIndex);
    ctx.globalFieldIndex++;
    setSniptaleId(valueEl, stableId);

    fields.push({
      type: 'field',
      id: stableId,
      label,
      value,
      valueType,
      selector: getSelector(valueEl),
      selected: true,
      ...(linkRef === undefined ? {} : { linkRef }),
    });
  });

  return fields;
}

/**
 * Generic Definition List Parser
 * Handles <dl> elements
 */
export class DefinitionListParser extends DOMParser {
  name = 'DefinitionList';
  priority = 20; // Low priority - fallback for non-GWT sites

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    if (element.tagName.toLowerCase() !== 'dl') return false;

    // Must have dt and dd pairs
    const dts = element.querySelectorAll(':scope > dt');
    const dds = element.querySelectorAll(':scope > dd');

    return dts.length > 0 && dds.length > 0;
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    // Create section if none exists
    if (!ctx.currentSection) {
      const orphanSection = {
        type: 'section' as const,
        id: generateId('section'),
        title: 'Атрибуты',
        children: [],
        selected: true,
      };
      ctx.result.structure.push(orphanSection);
      ctx.currentSection = orphanSection;
    }

    const fields = parseDefinitionList(element as HTMLDListElement, ctx);

    if (fields.length > 0) {
      ctx.currentSection.children.push(...fields);
      return { fields };
    }

    return {};
  }
}
