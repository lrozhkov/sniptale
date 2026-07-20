import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { redactSensitiveAiFieldValue } from '@sniptale/platform/security/ai-payload-privacy';
import { buildElementEvidence, buildElementTargetRef } from '../../../ir/document-evidence';
import { isRichTextEditorChromeElement } from '../../../rich-text-content';
import { generateStableId } from '../../../dom-utils/id-generator';
import { getSelector, setSniptaleId } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import { isPortalHomepage } from '../text/page-context.helpers';

export type FieldValueType = FieldNode['valueType'];

const EXCLUDED_PARENT_SELECTOR = '.gwt-ToolPanel, .buttonsGroup, .toolbar, .actions, .g-button';
export const ATTR_WIDE_SELECTOR =
  'td.attrWide, [id$="-caption"], [id$="-value"], .richTextWideView';
export const FORM_CONTAINER_SELECTOR = '.form-group, .field, .form-field, .FormField-EA__field';

export function isForeignVirtualIframeDescendant(container: HTMLElement, candidate: Element) {
  const containerIframe = container.closest('[data-virtual-iframe]');
  const candidateIframe = candidate.closest('[data-virtual-iframe]');
  return candidateIframe !== null && candidateIframe !== containerIframe;
}

export function buildFieldNode(props: {
  ctx: TraversalContext;
  label: string;
  linkRef?: string | undefined;
  sourceElement: HTMLElement;
  value: string;
  valueType: FieldValueType;
}): FieldNode {
  const stableId = generateStableId('field', props.sourceElement, props.ctx.globalFieldIndex);
  const value = redactSensitiveAiFieldValue({ label: props.label, value: props.value });
  props.ctx.globalFieldIndex++;
  setSniptaleId(props.sourceElement, stableId);

  return {
    type: 'field',
    id: stableId,
    label: props.label,
    value,
    valueType: props.valueType,
    selector: getSelector(props.sourceElement),
    selected: true,
    evidence: buildElementEvidence(props.sourceElement, {
      excerpt: value,
    }),
    ...(props.linkRef === undefined ? {} : { linkRef: props.linkRef }),
    ...(() => {
      const targetRef = buildElementTargetRef(props.sourceElement, true, stableId);
      return targetRef === undefined ? {} : { targetRef };
    })(),
  };
}

export function isExcludedFieldContainer(element: HTMLElement): boolean {
  return (
    Boolean(element.closest(EXCLUDED_PARENT_SELECTOR)) ||
    Boolean(element.closest(ATTR_WIDE_SELECTOR)) ||
    isRichTextEditorChromeElement(element)
  );
}

function shouldSkipPortalHomepageContainer(container: HTMLElement, ctx: TraversalContext): boolean {
  if (!isPortalHomepage(ctx, container)) {
    return false;
  }

  return (
    container.matches(
      [
        'body',
        '.CoreLayout__content',
        '.Main__root',
        '.wrapper',
        '.SearchBlock__root',
        '.SearchBlock__form',
        '.Search__search',
        '.Search__control',
        '.Section__root',
        '.Footer__footerBlock',
      ].join(', ')
    ) || Boolean(container.closest('.SearchBlock__root, .Section__root, .Footer__footerBlock'))
  );
}

export function shouldSkipFormFieldsContainerWithContext(
  container: HTMLElement,
  ctx?: TraversalContext
): boolean {
  return (
    Boolean(container.closest(EXCLUDED_PARENT_SELECTOR)) ||
    isRichTextEditorChromeElement(container) ||
    Boolean(ctx && shouldSkipPortalHomepageContainer(container, ctx))
  );
}
