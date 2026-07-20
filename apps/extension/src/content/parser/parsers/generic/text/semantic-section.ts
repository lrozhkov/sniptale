/**
 * Generic Semantic Section Parser
 * Parses semantic HTML elements: article, section, main
 */

import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DOMParser, type TraversalContext, type ParserResult } from '../../types';
import { generateId } from '../../../dom-utils/id-generator';
import { extractCleanText } from '../../../dom-utils/dom-helpers';

const logger = createLogger({ namespace: 'ContentSemanticSectionParser' });

/**
 * Extracts title from semantic section
 */
function extractSectionTitle(element: HTMLElement): string {
  // Look for heading inside
  const heading = element.querySelector(
    'h1, h2, h3, h4, h5, h6, .title, .header, [class*="title"]'
  );
  if (heading) {
    const text = extractCleanText(heading as HTMLElement);
    if (text && text.length < 100) {
      return text;
    }
  }

  // Look for aria-label or aria-labelledby
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelElement = document.getElementById(labelledBy);
    if (labelElement) {
      const text = extractCleanText(labelElement);
      if (text && text.length < 100) {
        return text;
      }
    }
  }

  // Fallback to tag name
  const tagNames: Record<string, string> = {
    article: 'Статья',
    section: 'Раздел',
    main: 'Основное содержимое',
  };

  return tagNames[element.tagName.toLowerCase()] || element.tagName.toLowerCase();
}

/**
 * Generic Semantic Section Parser
 * Handles semantic HTML elements
 */
export class SemanticSectionParser extends DOMParser {
  name = 'SemanticSection';
  priority = 10; // Low priority - fallback for non-GWT sites

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    const semanticTags = ['article', 'section', 'main'];
    const tagName = element.tagName.toLowerCase();

    if (semanticTags.includes(tagName)) {
      // Only parse if it has content
      const hasContent = element.querySelector(
        'p, table, dl, ul, ol, form, h1, h2, h3, h4, h5, h6'
      );
      return hasContent !== null;
    }

    // Also check for role="region"
    if (element.getAttribute('role') === 'region') {
      return true;
    }

    return false;
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    const title = extractSectionTitle(element);

    const section = {
      type: 'section' as const,
      id: generateId('section'),
      title,
      children: [] as FieldNode[],
      selected: true,
    };

    ctx.result.structure.push(section);
    ctx.currentSection = section;
    ctx.sectionIndex++;
    ctx.sectionElements.push(element);

    logger.log('Started section', title);

    return { newSection: section };
  }
}
