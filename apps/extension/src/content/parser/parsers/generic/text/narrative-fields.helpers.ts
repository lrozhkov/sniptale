import type { FieldContentRole, FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { buildElementEvidence, buildElementTargetRef } from '../../../ir/document-evidence';
import { generateStableId } from '../../../dom-utils/id-generator';
import { extractNarrativeText, getSelector, setSniptaleId } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';

type NarrativeFieldOptions = {
  contentRole: Extract<FieldContentRole, 'paragraph' | 'list-item'>;
  label: string;
  maxLength?: number;
  minLength: number;
};

function truncateNarrativeText(text: string, maxLength?: number): string {
  if (!maxLength || text.length <= maxLength) {
    return text;
  }

  return `${text.substring(0, maxLength - 3)}...`;
}

export function createNarrativeField(
  element: HTMLElement,
  ctx: TraversalContext,
  options: NarrativeFieldOptions
): FieldNode | null {
  const text = extractNarrativeText(element);
  if (!text || text.length < options.minLength) {
    return null;
  }

  const stableId = generateStableId('field', element, ctx.globalFieldIndex);
  ctx.globalFieldIndex++;
  setSniptaleId(element, stableId);

  return {
    type: 'field',
    id: stableId,
    label: options.label,
    value: truncateNarrativeText(text, options.maxLength),
    valueType: 'string',
    contentRole: options.contentRole,
    selector: getSelector(element),
    selected: true,
    editable: true,
    evidence: buildElementEvidence(element, {
      excerpt: truncateNarrativeText(text, options.maxLength),
    }),
    ...(() => {
      const targetRef = buildElementTargetRef(element, true, stableId);
      return targetRef === undefined ? {} : { targetRef };
    })(),
  };
}
