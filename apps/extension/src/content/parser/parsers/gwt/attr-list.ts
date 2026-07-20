/**
 * GWT Attribute List Parser
 * Parses table.attrList into field nodes
 */

import { createLogger } from '@sniptale/platform/observability/logger';
import { DOMParser, type TraversalContext, type ParserResult } from '../types';
import { generateId } from '../../dom-utils/id-generator';
import { parseAttributes } from './attr-list.helpers';

const logger = createLogger({ namespace: 'ContentGwtAttrListParser' });

/**
 * GWT Attribute List Parser
 * Handles table.attrList elements
 */
export class GWTAttrListParser extends DOMParser {
  name = 'GWTAttrList';
  priority = 90; // High priority after sections

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    return (
      element.matches('table.attrList') && !ctx.processedAttrLists.has(element as HTMLTableElement)
    );
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseGwtAttrListElement(element as HTMLTableElement, ctx);
  }
}

export function parseGwtAttrListElement(
  element: HTMLTableElement,
  ctx: TraversalContext
): ParserResult {
  // Create section if none exists
  if (!ctx.currentSection) {
    const orphanSection = {
      type: 'section' as const,
      id: generateId('section'),
      title: 'Атрибуты',
      children: [],
      selected: true,
      kind: 'record' as const,
    };
    ctx.result.structure.push(orphanSection);
    ctx.currentSection = orphanSection;
  }

  // CRITICAL: Save current section BEFORE parseAttributes
  // parseAttributes may trigger TreeWalker to visit other elements
  // which can change ctx.currentSection via updateSectionContext
  const targetSection = ctx.currentSection;

  const fields = parseAttributes(element, ctx);
  targetSection.children.push(...fields);
  ctx.processedAttrLists.add(element);

  logger.log('Added fields to section', {
    sectionTitle: targetSection.title,
    fieldsCount: fields.length,
    fieldLabels: fields.map((field) => field.label),
  });

  return { fields };
}
