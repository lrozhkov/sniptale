/**
 * GWT Comments Parser
 * Parses CommentList into table nodes
 */

import { generateId } from '../../dom-utils/id-generator';
import { extractCleanText } from '../../dom-utils/dom-helpers';
import { DOMParser, type ParserResult, type TraversalContext } from '../types';
import { parseCommentList } from './comments-table.helpers';
import { createLogger } from '@sniptale/platform/observability/logger';

const logger = createLogger({ namespace: 'ContentParser:GwtComments' });

/**
 * GWT Comments Parser
 * Handles CommentList elements
 */
export class GWTCommentsParser extends DOMParser {
  name = 'GWTComments';
  priority = 70; // After tables

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    const elementId = element.id || '';

    logger.debug('canParse called', {
      className: element.className.substring(0, 50),
      elementId,
      tagName: element.tagName,
    });

    // Skip if already processed
    if (ctx.processedCommentContainers.has(element)) {
      logger.debug('Skipping already processed comment container', elementId);
      return false;
    }

    // Skip if this element is INSIDE an already processed container
    for (const container of ctx.processedCommentContainers) {
      if (container.contains(element)) {
        logger.debug('Skipping element inside processed comment container', {
          containerId: container.id,
          elementId,
        });
        return false;
      }
    }

    // Support both legacy GWT comment lists and current portal block layout.
    if (elementId.includes('CommentList') || elementId === 'comments') {
      logger.debug('Matched comment container by id', elementId);
      return true;
    }

    // Do NOT match nested tables or other containers with comments
    // They will be skipped because we process the main CommentList first

    logger.debug('No match for comment container', elementId);
    return false;
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseGwtCommentsElement(element, ctx);
  }
}

export function parseGwtCommentsElement(element: HTMLElement, ctx: TraversalContext): ParserResult {
  let sectionTitle = 'Комментарии';
  const titleElement = element.querySelector('[id*="title"], .GAQEVERAM, .Title__title');
  if (titleElement) {
    const titleText = extractCleanText(titleElement as HTMLElement);
    if (titleText) {
      sectionTitle = titleText;
    }
  }

  if (!ctx.currentSection || ctx.currentSection.title !== sectionTitle) {
    const commentsSection = {
      type: 'section' as const,
      id: generateId('section'),
      title: sectionTitle,
      children: [],
      selected: true,
      kind: 'thread' as const,
    };
    ctx.result.structure.push(commentsSection);
    ctx.currentSection = commentsSection;
  }

  const commentsTable = parseCommentList(element, ctx);
  if (commentsTable) {
    ctx.currentSection.children.push(commentsTable);
    ctx.processedCommentContainers.add(element);
    return { tables: [commentsTable] };
  }

  return {};
}
