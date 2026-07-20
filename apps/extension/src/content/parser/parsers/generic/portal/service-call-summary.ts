import { generateId } from '../../../dom-utils/id-generator';
import type { FieldNode, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { extractCompositeText } from '../../../dom-utils/dom-helpers';
import { DOMParser, type ParserResult, type TraversalContext } from '../../types';
import { buildFieldNode } from '../forms/fields.helpers';

const HEADER_DATE_LABELS = ['Дата создания', 'Прогнозируемый срок обработки'];

function buildSummaryField(
  ctx: TraversalContext,
  label: string,
  value: string,
  sourceElement: HTMLElement
) {
  if (!label || !value) {
    return null;
  }

  return buildFieldNode({
    ctx,
    label,
    sourceElement,
    value,
    valueType: 'string',
  });
}

function parseLabeledTextNode(ctx: TraversalContext, element: HTMLElement | null) {
  if (!element) {
    return null;
  }

  return parseLabeledTextValue(
    ctx,
    extractCompositeText(element).replace(/\s*\|\s*$/, ''),
    element
  );
}

function parseLabeledTextValue(ctx: TraversalContext, rawText: string, sourceElement: HTMLElement) {
  const labelMatch = rawText.match(/^([^:]+):\s+/);
  if (!labelMatch) {
    return null;
  }

  const [, rawLabel = ''] = labelMatch;
  const label = rawLabel.trim();
  if (!label) {
    return null;
  }
  const value = rawText.slice((labelMatch[0] ?? '').length).trim();
  return buildSummaryField(ctx, label, value, sourceElement);
}

function parseHeaderDateFields(container: HTMLElement, ctx: TraversalContext) {
  const attributeElements = Array.from(container.querySelectorAll('.TextBoxWithIcon__attribute'));
  if (attributeElements.length > 0) {
    return attributeElements
      .map(
        (attributeEl, index) =>
          parseLabeledTextNode(ctx, attributeEl as HTMLElement) ??
          buildSummaryField(
            ctx,
            HEADER_DATE_LABELS[index] || `Дата ${index + 1}`,
            extractCompositeText(attributeEl as HTMLElement),
            attributeEl as HTMLElement
          )
      )
      .filter((field): field is FieldNode => field !== null);
  }

  const attributesBox = container.querySelector('.TextBoxWithIcon__attributesBox');
  if (!(attributesBox instanceof HTMLElement)) {
    return [];
  }

  return extractCompositeText(attributesBox)
    .split('|')
    .map((part) => part.trim())
    .map((part) => (part ? parseLabeledTextValue(ctx, part, attributesBox) : null))
    .filter((field): field is FieldNode => field !== null);
}

function parseExactTextField(
  container: HTMLElement,
  ctx: TraversalContext,
  label: string,
  selector: string
) {
  const element = container.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  return buildSummaryField(ctx, label, extractCompositeText(element), element);
}

function parseServiceCallHeaderFields(container: HTMLElement, ctx: TraversalContext) {
  const requestNumberElement =
    (container.querySelector('#ServiceCall__title span') as HTMLElement | null) ||
    (container.querySelector('#ServiceCall__title') as HTMLElement | null);

  const fields = [
    requestNumberElement
      ? buildSummaryField(
          ctx,
          'Номер запроса',
          extractCompositeText(requestNumberElement),
          requestNumberElement
        )
      : null,
    parseExactTextField(container, ctx, 'Статус', '.ServiceCallStatus__status, .StatusTag__tag'),
    parseLabeledTextNode(ctx, container.querySelector('.DetailsHead__serviceTitle') as HTMLElement),
    parseLabeledTextNode(ctx, container.querySelector('.DetailsHead__routeTitle') as HTMLElement),
    parseExactTextField(container, ctx, 'Категория', '.DetailsHead__category'),
    parseLabeledTextNode(ctx, container.querySelector('.Deadline__waitingTime') as HTMLElement),
  ];

  return fields.filter((field): field is FieldNode => field !== null);
}

function ensureSummarySection(ctx: TraversalContext) {
  const existingSection = ctx.result.structure.find(
    (section) => section.title === 'Общая информация'
  );
  if (existingSection) {
    return existingSection;
  }

  const section: SectionNode = {
    type: 'section' as const,
    id: generateId('section'),
    title: 'Общая информация',
    children: [],
    selected: true,
    kind: 'record',
  };

  ctx.result.structure.push(section);
  return section;
}

export class ServiceCallSummaryParser extends DOMParser {
  name = 'ServiceCallSummary';
  priority = 19;

  canParse(element: HTMLElement, _ctx: TraversalContext): boolean {
    return element.id === 'serviceCall';
  }

  parse(element: HTMLElement, ctx: TraversalContext): ParserResult {
    return parseServiceCallSummaryElement(element, ctx);
  }
}

export function parseServiceCallSummaryElement(
  element: HTMLElement,
  ctx: TraversalContext
): ParserResult {
  const fields: FieldNode[] = [
    ...parseServiceCallHeaderFields(element, ctx),
    ...parseHeaderDateFields(element, ctx),
  ];

  if (fields.length === 0) {
    return {};
  }

  const section = ensureSummarySection(ctx);
  section.children.push(...fields);
  return { fields, newSection: section };
}
