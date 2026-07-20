import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  buildDynamicIframeFieldNodes,
  extractDynamicFieldsContent,
  extractVirtualDynamicFieldsContent,
} from '../../gwt/attr-list-dynamic-fields.helpers';
import { DOMParser, type ParserResult, type TraversalContext } from '../../types';
import { appendFieldsToTitledSection } from '../text/sections.helpers';

function resolveOriginalIframe(container: HTMLElement) {
  const originalIframe = document.getElementById(container.id);
  return originalIframe instanceof HTMLIFrameElement ? originalIframe : null;
}

function resolveDynamicFieldsSectionTitle(element: HTMLElement): string {
  const titleElement = element
    .closest('[id*="EmbeddedApplicationContent"], .GAQEVERFM')
    ?.querySelector('#gwt-debug-title, [id*="title"]');
  const title = titleElement instanceof HTMLElement ? titleElement.textContent?.trim() : '';
  return title || 'Дополнительные параметры';
}

export class DynamicFieldsEmbeddedAppParser extends DOMParser {
  name = 'DynamicFieldsEmbeddedApp';
  priority = 24;

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    return (
      element.getAttribute('data-virtual-iframe') === 'true' &&
      element.getAttribute('data-application-code') === 'dynamicFields'
    );
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseDynamicFieldsEmbeddedAppElement(element, ctx);
  }
}

export function parseDynamicFieldsEmbeddedAppElement(
  element: HTMLElement,
  ctx: TraversalContext
): ParserResult {
  const originalIframe = resolveOriginalIframe(element);
  const extractedFields =
    (originalIframe ? extractDynamicFieldsContent(originalIframe, ctx) : null) ||
    extractVirtualDynamicFieldsContent(element, ctx) ||
    [];

  if (extractedFields.length === 0) {
    return { skipChildren: true };
  }

  const fields: FieldNode[] = buildDynamicIframeFieldNodes(extractedFields);
  appendFieldsToTitledSection({
    ctx,
    fields,
    reuseExisting: true,
    title: resolveDynamicFieldsSectionTitle(element),
  });

  return {
    fields,
    skipChildren: true,
  };
}
