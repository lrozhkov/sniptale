/**
 * GWT Section Parser
 * Parses GWT DisclosurePanel and similar containers into sections
 */

import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { DOMParser, type TraversalContext, type ParserResult } from '../types';
import { generateId } from '../../dom-utils/id-generator';
import { findSectionTitle } from './section.helpers';

const logger = createLogger({ namespace: 'ContentParser:GwtSection' });
const sectionByElement = new WeakMap<
  HTMLElement,
  TraversalContext['result']['structure'][number]
>();

/**
 * GWT Section Parser
 * Handles DisclosurePanel, PropertyList, and similar containers
 */
export const GWT_SECTION_SELECTOR = [
  '.gwt-DisclosurePanel',
  '[id*="PropertyList"]',
  '[id*="commentsPanel"]',
  '[id*="RelObjectList"]',
  '.GAQEVERFM',
  '[id*="EmbeddedApplicationContent"]',
  '[id*="dynamicFields"]',
].join(', ');

export class GWTSectionParser extends DOMParser {
  name = 'GWTSection';
  priority = 100; // High priority - sections should be detected first

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    // IMPORTANT: Skip comment containers - they are handled by GWTCommentsParser
    if (element.matches('[id*="CommentList"], [id*="commentsAlt"]')) {
      return false;
    }

    return element.matches(GWT_SECTION_SELECTOR);
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseGwtSectionElement(element, ctx);
  }
}

export function parseGwtSectionElement(element: HTMLElement, ctx: TraversalContext): ParserResult {
  const title = findSectionTitle(element);

  const section = {
    type: 'section' as const,
    id: generateId('section'),
    title,
    children: [] as FieldNode[],
    selected: true,
    kind: 'record' as const,
  };

  ctx.result.structure.push(section);
  ctx.sectionIndex++;

  // Add the disclosure panel element itself to sectionElements
  // This section will remain active as long as TreeWalker is inside this element
  ctx.sectionElements.push(element);
  sectionByElement.set(element, section);
  const trackedElementLabel = `${element.tagName}#${element.id || element.className}`;
  logger.debug(`Started section: ${title}, tracking element: ${trackedElementLabel}`);

  // Set currentSection to this section immediately
  // This ensures fields within this section are captured correctly
  ctx.currentSection = section;

  // CRITICAL: Check for pending fields from embedded iframes
  // These fields were parsed before the section container was encountered
  const pendingFields = ctx.pendingFields;
  if (pendingFields) {
    // Try to match by section title
    const titleToMatch = title.toLowerCase();
    for (const [pendingTitle, fields] of pendingFields.entries()) {
      const pendingTitleLower = pendingTitle.toLowerCase();
      if (titleToMatch.includes(pendingTitleLower) || pendingTitleLower.includes(titleToMatch)) {
        logger.debug(`Found ${fields.length} pending fields for section: ${title}`);
        section.children.push(...fields);
        pendingFields.delete(pendingTitle);
        break;
      }
    }
  }

  return { newSection: section, skipChildren: false };
}

/**
 * Updates section context when exiting a section
 *
 * SIMPLIFIED APPROACH: Only close section when we encounter a NEW section element.
 *
 * In virtual DOM mode, contains() checks don't work reliably because:
 * - Section elements are from original DOM
 * - Current nodes may be from embedded iframe content (different DOM tree)
 *
 * Solution: Track sections by detecting NEW section starts only.
 * A section stays active until we see another section element.
 */
export function updateSectionContext(node: HTMLElement, ctx: TraversalContext): void {
  // Get original element for current node (if in virtual DOM)
  const getOriginalFn = ctx.getOriginalElementFn;
  const originalNode = getOriginalFn ? getOriginalFn(node) : node;
  if (!(originalNode instanceof HTMLElement)) {
    return;
  }

  // Only close section when we encounter a NEW section element
  // This is the ONLY reliable way to detect section boundaries in virtual DOM
  const isNewSection =
    originalNode.matches?.(
      [
        '.gwt-DisclosurePanel',
        '[id*="PropertyList"]',
        '[id*="EmbeddedApplicationContent"]',
        '.GAQEVERFM',
        '[id*="ChildObjectList"]',
      ].join(', ')
    ) ||
    (originalNode.id &&
      (originalNode.id.includes('PropertyList') ||
        originalNode.id.includes('EmbeddedApplicationContent') ||
        originalNode.id.includes('ChildObjectList')));
  if (isNewSection && ctx.sectionElements.length > 0) {
    const currentSectionElement = ctx.sectionElements[ctx.sectionElements.length - 1];
    if (currentSectionElement === originalNode) {
      return;
    }

    closeActiveSection(originalNode, ctx);
    return;
  }

  reconcileExitedSections(originalNode, ctx);
}

function reconcileExitedSections(originalNode: HTMLElement, ctx: TraversalContext): void {
  while (ctx.sectionElements.length > 0) {
    const currentSectionElement = ctx.sectionElements[ctx.sectionElements.length - 1];
    if (!currentSectionElement) {
      return;
    }
    if (currentSectionElement.ownerDocument !== originalNode.ownerDocument) {
      return;
    }

    if (currentSectionElement === originalNode || currentSectionElement.contains(originalNode)) {
      ctx.currentSection = sectionByElement.get(currentSectionElement) ?? null;
      return;
    }

    closeActiveSection(originalNode, ctx);
  }
}

function closeActiveSection(originalNode: HTMLElement, ctx: TraversalContext): void {
  const exitedSection = ctx.sectionElements.pop();
  if (!exitedSection) {
    ctx.currentSection = null;
    return;
  }

  logSectionContextTransition(exitedSection, originalNode);
  const previousSectionElement = ctx.sectionElements[ctx.sectionElements.length - 1];
  ctx.currentSection = previousSectionElement
    ? (sectionByElement.get(previousSectionElement) ?? null)
    : null;
}

function logSectionContextTransition(exitedSection: HTMLElement, originalNode: HTMLElement) {
  logger.debug(`Exited section (new section found): ${findSectionTitle(exitedSection)}`);
  logger.debug(`New section element: ${originalNode.tagName}#${originalNode.id}`);
}
