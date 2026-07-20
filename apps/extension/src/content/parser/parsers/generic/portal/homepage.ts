import type { SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { DOMParser, type ParserResult, type TraversalContext } from '../../types';
import { isPortalHomepage } from '../text/page-context.helpers';
import { PORTAL_SECTION_SELECTOR } from './homepage.helpers';
import { parsePortalHomepageSection } from './homepage-section.helpers';

export class PortalHomepageParser extends DOMParser {
  name = 'PortalHomepage';
  priority = 23;

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    return isPortalHomepage(ctx, element) && element.matches(PORTAL_SECTION_SELECTOR);
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parsePortalHomepageSection(element, ctx);
  }
}

export function extractPortalHomepageSections(
  root: ParentNode,
  ctx: TraversalContext
): SectionNode[] {
  const elements = [
    ...(root instanceof HTMLElement && root.matches(PORTAL_SECTION_SELECTOR) ? [root] : []),
    ...Array.from(root.querySelectorAll<HTMLElement>(PORTAL_SECTION_SELECTOR)),
  ];

  elements.forEach((element) => {
    parsePortalHomepageSection(element, ctx);
  });

  return ctx.result.structure;
}
