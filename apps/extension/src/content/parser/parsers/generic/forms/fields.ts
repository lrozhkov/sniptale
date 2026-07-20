/**
 * Generic Form Fields Parser
 * Parses form elements: label + input, select, textarea
 * Also handles common key-value container patterns
 */

import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { createLogger } from '@sniptale/platform/observability/logger';
import { isRichTextEditorChromeElement } from '../../../rich-text-content';
import { DOMParser, type TraversalContext, type ParserResult } from '../../types';
import { generateId } from '../../../dom-utils/id-generator';
import { extractCleanText } from '../../../dom-utils/dom-helpers';
import { shouldSkipFormFieldsContainerWithContext } from './fields.helpers';
import { parseKeyValueFields } from './key-value.helpers';
import { parseLabeledFormFields } from './labeled.helpers';

const logger = createLogger({ namespace: 'ContentParser:FormFields' });

/**
 * Parses form fields into FieldNodes
 */
function parseFormFields(container: HTMLElement, ctx: TraversalContext): FieldNode[] {
  const processedElements = new Set<Element>();

  if (shouldSkipFormFieldsContainerWithContext(container, ctx)) {
    return [];
  }

  return [
    ...parseLabeledFormFields(container, ctx, processedElements),
    ...parseKeyValueFields(container, ctx, processedElements),
  ];
}

function getOrCreateCurrentSection(element: HTMLElement, ctx: TraversalContext) {
  if (ctx.currentSection) {
    logger.debug(`Using existing section: ${ctx.currentSection.title}`);
    return ctx.currentSection;
  }

  logger.debug('No current section, creating new "Форма" section');
  let sectionTitle = 'Форма';
  const heading = element.querySelector('h1, h2, h3, h4, h5, h6, .title, legend');
  if (heading) {
    const text = extractCleanText(heading as HTMLElement);
    if (text && text.length < 100) {
      sectionTitle = text;
    }
  }

  const orphanSection = {
    type: 'section' as const,
    id: generateId('section'),
    title: sectionTitle,
    children: [],
    selected: true,
  };
  ctx.result.structure.push(orphanSection);
  ctx.currentSection = orphanSection;
  return orphanSection;
}

/**
 * Generic Form Fields Parser
 * Handles form elements and key-value containers
 */
export class FormFieldsParser extends DOMParser {
  name = 'FormFields';
  priority = 5; // Lowest priority - fallback for everything else

  canParse(element: HTMLElement, ctx: TraversalContext): boolean {
    if (
      isRichTextEditorChromeElement(element) ||
      shouldSkipFormFieldsContainerWithContext(element, ctx)
    ) {
      return false;
    }

    // EXCLUDE: Buttons and interactive controls (not data fields)
    if (element.matches('.buttonsGroup, .g-button, button, [role="button"]')) {
      return false;
    }

    // EXCLUDE: Elements inside button containers and tool panels
    if (element.closest('.buttonsGroup, .toolbar, .actions, .gwt-ToolPanel')) {
      return false;
    }

    // Check if element itself is a field container
    if (element.matches('.FormField-EA__field, .field, .form-field, .form-group')) {
      return true;
    }

    // Check for form or form-like container
    const hasFormElements = element.querySelector(
      'label, input, select, textarea, .field, .form-field, .form-group, .FormField-EA__field'
    );

    // Also check for key-value containers
    const hasKeyValueStructure = element.querySelector(
      '[class*="label"] + [class*="value"], dt + dd, .FormField-EA__fieldInfo + .FormField-EA__fieldBody'
    );

    return hasFormElements !== null || hasKeyValueStructure !== null;
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    // CRITICAL: If we have a current section from parent document, USE IT
    // This prevents creating duplicate "Форма" sections for iframe content
    logger.debug('parse() called', { currentSection: ctx.currentSection?.title || 'null' });
    getOrCreateCurrentSection(element, ctx);
    if (!ctx.currentSection) {
      return {};
    }

    const fields = parseFormFields(element, ctx);

    if (fields.length > 0) {
      ctx.currentSection.children.push(...fields);
      logger.debug(
        `Added ${fields.length} fields to section "${ctx.currentSection.title}"`,
        fields.map((field) => field.label)
      );
      return { fields };
    }

    return {};
  }
}
