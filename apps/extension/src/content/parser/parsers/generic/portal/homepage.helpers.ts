import type { FieldNode, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import { generateId } from '../../../dom-utils/id-generator';
import { extractCompositeText } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import { buildFieldNode } from '../forms/fields.helpers';

export const PORTAL_SECTION_SELECTOR = '.SearchBlock__root, .Section__root, .Footer__footerBlock';

export function createPortalSection(ctx: TraversalContext, title: string): SectionNode {
  const section: SectionNode = {
    type: 'section',
    id: generateId('section'),
    title,
    children: [],
    selected: true,
  };

  ctx.result.structure.push(section);
  ctx.currentSection = section;
  return section;
}

export function buildPortalField(
  ctx: TraversalContext,
  label: string,
  value: string,
  sourceElement: HTMLElement
): FieldNode | null {
  const normalizedLabel = label.trim();
  const normalizedValue = value.trim();
  if (!normalizedLabel || !normalizedValue) {
    return null;
  }

  return buildFieldNode({
    ctx,
    label: normalizedLabel,
    linkRef: undefined,
    sourceElement,
    value: normalizedValue,
    valueType: 'string',
  });
}

export function getElementText(
  element: Element | null,
  fallbackElement: HTMLElement
): { sourceElement: HTMLElement; value: string } {
  if (element instanceof HTMLElement) {
    return {
      sourceElement: element,
      value: extractCompositeText(element),
    };
  }

  return {
    sourceElement: fallbackElement,
    value: '',
  };
}

export function resolvePortalSectionTitle(element: HTMLElement): string {
  const titleCandidate = element.querySelector(
    [
      '.SearchBlock__headerTitle',
      '.Title__title__href',
      '.Title__titleLabel',
      '.Footer__footerBlockCaption',
    ].join(', ')
  );

  const title = titleCandidate instanceof HTMLElement ? extractCompositeText(titleCandidate) : '';
  return title.replace(/\u00a0/g, ' ').trim() || 'Раздел';
}
