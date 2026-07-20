import { DOMParser, type ParserResult, type TraversalContext } from '../../types';
import { MVS_APPLICATION_CODE } from '../../../dom-tree-parser/mvs/constants';
import { extractMvsEmbeddedAppFields } from './embedded-app.helpers';

/**
 * Parses Sniptale-relevant Naumen MVS iframe containers from the live iframe document.
 */
export class MvsEmbeddedAppParser extends DOMParser {
  name = 'MvsEmbeddedApp';
  priority = 25;

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    return (
      element.getAttribute('data-virtual-iframe') === 'true' &&
      element.getAttribute('data-application-code') === MVS_APPLICATION_CODE
    );
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseMvsEmbeddedAppElement(element, ctx);
  }
}

export function parseMvsEmbeddedAppElement(
  element: HTMLElement,
  ctx: TraversalContext
): ParserResult {
  const fields = extractMvsEmbeddedAppFields(element, ctx);

  if (ctx.currentSection && fields.length > 0) {
    ctx.currentSection.children.push(...fields);
  }

  return {
    fields,
    skipChildren: true,
  };
}
