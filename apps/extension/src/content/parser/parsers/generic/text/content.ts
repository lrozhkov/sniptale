import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DOMParser, type TraversalContext, type ParserResult } from '../../types';
import { extractCleanText, extractNarrativeText } from '../../../dom-utils/dom-helpers';
import { createNarrativeField } from './narrative-fields.helpers';

/**
 * Maximum text length for a single field
 */
const MAX_TEXT_LENGTH = 500;
const logger = createLogger({ namespace: 'ContentTextContentParser' });

function getDirectChildElementsByTagNames(
  container: HTMLElement,
  tagNames: string[]
): HTMLElement[] {
  const allowed = new Set(tagNames);
  return Array.from(container.children).filter((child): child is HTMLElement => {
    return child instanceof HTMLElement && allowed.has(child.tagName.toLowerCase());
  });
}

function getNestedParagraphsUnderDirectDivs(container: HTMLElement): HTMLParagraphElement[] {
  return getDirectChildElementsByTagNames(container, ['div']).flatMap((child) => {
    return Array.from(child.children).filter((nestedChild): nestedChild is HTMLParagraphElement => {
      return nestedChild instanceof HTMLParagraphElement;
    });
  });
}

/**
 * Extracts paragraphs from container
 */
function parseParagraphs(container: HTMLElement, ctx: TraversalContext): FieldNode[] {
  const fields: FieldNode[] = [];

  container.querySelectorAll('p').forEach((pEl) => {
    if (ctx.processedFieldElements.has(pEl)) return;

    const field = createNarrativeField(pEl as HTMLElement, ctx, {
      contentRole: 'paragraph',
      label: 'Текст',
      maxLength: MAX_TEXT_LENGTH,
      minLength: 20,
    });
    if (!field) return;

    ctx.processedFieldElements.add(pEl);
    fields.push(field);
  });

  return fields;
}

/**
 * Extracts list items from container
 */
function parseLists(container: HTMLElement, ctx: TraversalContext): FieldNode[] {
  const fields: FieldNode[] = [];

  // Parse unordered and ordered lists
  container.querySelectorAll('ul, ol').forEach((listElRaw) => {
    const listEl = listElRaw as HTMLElement;
    if (ctx.processedFieldElements.has(listEl)) return;

    const items = getDirectChildElementsByTagNames(listEl, ['li']);
    if (items.length === 0) return;

    ctx.processedFieldElements.add(listEl);

    // Get preceding heading or use "Список"
    let label = 'Список';
    const prevHeading = listEl.previousElementSibling;
    if (prevHeading && /^H[1-6]$/.test(prevHeading.tagName)) {
      label = extractCleanText(prevHeading as HTMLElement);
    }

    // Create field for each list item (up to 10)
    items.forEach((item, index) => {
      if (index >= 10) return; // Limit to 10 items

      const itemEl = item as HTMLElement;
      const field = createNarrativeField(itemEl, ctx, {
        contentRole: 'list-item',
        label: `${label} ${index + 1}`,
        maxLength: MAX_TEXT_LENGTH,
        minLength: 5,
      });
      if (!field) return;

      fields.push(field);
    });
  });

  return fields;
}

/**
 * Extracts headings as section titles
 */
function parseHeadings(
  container: HTMLElement,
  ctx: TraversalContext
): { title: string; fields: FieldNode[] } | null {
  const headings = container.querySelectorAll('h1, h2, h3, h4, h5, h6');

  if (headings.length === 0) return null;

  const firstHeading = headings[0];
  const title = extractNarrativeText(firstHeading as HTMLElement);

  if (!title) return null;

  ctx.processedFieldElements.add(firstHeading as HTMLElement);

  return {
    title,
    fields: [],
  };
}

function isExcludedContentContainer(element: HTMLElement): boolean {
  const excludePatterns = [
    'nav',
    'navigation',
    'sidebar',
    'header',
    'footer',
    'menu',
    'toc',
    'comment',
    'ads',
  ];
  return excludePatterns.some(
    (cls) => element.classList.contains(cls) || element.id.toLowerCase().includes(cls)
  );
}

function canParseDivContentContainer(element: HTMLElement): boolean {
  if (isExcludedContentContainer(element)) {
    return false;
  }

  const directParagraphs = getDirectChildElementsByTagNames(element, ['p']);
  if (directParagraphs.length >= 2) {
    return true;
  }

  const nestedParagraphs = getNestedParagraphsUnderDirectDivs(element);
  return nestedParagraphs.length >= 3;
}

/**
 * Generic Text Content Parser
 * Handles paragraphs, headings, and lists for content-heavy pages
 */
export class TextContentParser extends DOMParser {
  name = 'TextContent';
  priority = 15; // Between GWT (20) and SemanticSection (10)

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    const tagName = element.tagName.toLowerCase();

    // Semantic HTML5 content containers
    if (tagName === 'article' || tagName === 'main') {
      const hasParagraphs = element.querySelector('p');
      const hasHeadings = element.querySelector('h1, h2, h3, h4, h5, h6');
      return hasParagraphs !== null || hasHeadings !== null;
    }

    // <section> with paragraphs
    if (tagName === 'section') {
      const paragraphs = element.querySelectorAll('p');
      return paragraphs.length >= 2;
    }

    // Generic content container (common patterns)
    if (tagName === 'div') {
      return canParseDivContentContainer(element);
    }

    return false;
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    // Try to extract title from heading
    const headingInfo = parseHeadings(element, ctx);
    let title = headingInfo?.title;

    // Fallback titles based on element type
    if (!title) {
      const tagName = element.tagName.toLowerCase();
      if (tagName === 'article') {
        title = 'Статья';
      } else if (tagName === 'main') {
        title = 'Основное содержимое';
      } else {
        title = 'Содержимое';
      }
    }

    const section = {
      type: 'section' as const,
      id: `${title}_${ctx.sectionIndex}`,
      title,
      children: [] as FieldNode[],
      selected: true,
    };

    ctx.result.structure.push(section);
    ctx.currentSection = section;
    ctx.sectionIndex++;
    ctx.sectionElements.push(element);

    // Parse content
    const paragraphFields = parseParagraphs(element, ctx);
    const listFields = parseLists(element, ctx);

    section.children.push(...paragraphFields, ...listFields);

    logger.log(
      'Section summary',
      title,
      `${paragraphFields.length} paragraphs`,
      `${listFields.length} list items`
    );

    return { newSection: section };
  }
}
