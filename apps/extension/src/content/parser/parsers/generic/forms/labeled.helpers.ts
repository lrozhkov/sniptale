import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { isRichTextEditorChromeElement } from '../../../rich-text-content';
import { extractCleanText, extractLinkText } from '../../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../types';
import {
  ATTR_WIDE_SELECTOR,
  buildFieldNode,
  type FieldValueType,
  FORM_CONTAINER_SELECTOR,
  isForeignVirtualIframeDescendant,
} from './fields.helpers';
import { findElementByIdInLabelRoot } from './labeled.targets';
import { getPrivacySafeInputValue, shouldSkipSensitiveLabeledField } from './privacy';

type ResolvedFieldValue = {
  value: string;
  valueElement: HTMLElement | undefined;
  valueType: FieldValueType;
};

const EMPTY_RESOLVED_FIELD_VALUE: ResolvedFieldValue = {
  value: '',
  valueElement: undefined,
  valueType: 'string',
};

const EMPTY_LINK_FIELD_VALUE = {
  ...EMPTY_RESOLVED_FIELD_VALUE,
  linkRef: undefined as string | undefined,
};

function resolveLabeledInputValue(
  labelEl: HTMLLabelElement,
  processedElements: Set<Element>
): ResolvedFieldValue {
  const forId = labelEl.getAttribute('for');
  if (!forId) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  const input = findElementByIdInLabelRoot(labelEl, forId) as HTMLInputElement | null;
  if (!input) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  if (isRichTextEditorChromeElement(input)) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  processedElements.add(input);

  const valueType: FieldValueType =
    input.type === 'checkbox' || input.type === 'radio'
      ? 'boolean'
      : input.type === 'number'
        ? 'number'
        : 'string';

  return {
    value: getPrivacySafeInputValue(input, labelEl.textContent ?? undefined),
    valueElement: input,
    valueType,
  };
}

function resolveNestedFieldValue(
  labelEl: HTMLLabelElement,
  processedElements: Set<Element>
): ResolvedFieldValue {
  const formContainer = labelEl.closest(FORM_CONTAINER_SELECTOR);
  if (!formContainer) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  if (isRichTextEditorChromeElement(formContainer)) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  const input = formContainer.querySelector<HTMLElement>(
    'input, select, textarea, [contenteditable="true"]'
  );
  if (!input || processedElements.has(input)) {
    return {
      value: '',
      valueElement: undefined,
      valueType: 'string',
    };
  }

  processedElements.add(input);
  return {
    value: getPrivacySafeInputValue(input, labelEl.textContent ?? undefined),
    valueElement: input,
    valueType: 'string',
  };
}

function resolveSiblingFieldValue(
  labelEl: HTMLLabelElement,
  processedElements: Set<Element>
): ResolvedFieldValue {
  let sibling = labelEl.nextElementSibling;
  while (sibling) {
    if (isRichTextEditorChromeElement(sibling)) {
      return EMPTY_RESOLVED_FIELD_VALUE;
    }

    if (sibling.matches('input, select, textarea, [contenteditable="true"]')) {
      processedElements.add(sibling);
      return {
        value: getPrivacySafeInputValue(sibling as HTMLElement, labelEl.textContent ?? undefined),
        valueElement: sibling as HTMLElement,
        valueType: 'string',
      };
    }
    sibling = sibling.nextElementSibling;
  }

  return EMPTY_RESOLVED_FIELD_VALUE;
}

function resolveContainerLinkValue(labelEl: HTMLLabelElement, processedElements: Set<Element>) {
  const formContainer = labelEl.closest(FORM_CONTAINER_SELECTOR) || labelEl.parentElement;
  if (!formContainer) {
    return EMPTY_LINK_FIELD_VALUE;
  }

  if (isRichTextEditorChromeElement(formContainer)) {
    return EMPTY_LINK_FIELD_VALUE;
  }

  const link = formContainer.querySelector('a');
  if (!link || processedElements.has(link)) {
    return EMPTY_LINK_FIELD_VALUE;
  }

  const linkData = extractLinkText(formContainer as HTMLElement);
  processedElements.add(link);
  return {
    linkRef: linkData.href,
    value: linkData.text,
    valueElement: formContainer as HTMLElement,
    valueType: 'link' as FieldValueType,
  };
}

function resolveContainerTextValue(labelEl: HTMLLabelElement): ResolvedFieldValue {
  const formContainer = labelEl.closest(FORM_CONTAINER_SELECTOR) || labelEl.parentElement;
  if (!formContainer || formContainer === labelEl) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  if (isRichTextEditorChromeElement(formContainer)) {
    return EMPTY_RESOLVED_FIELD_VALUE;
  }

  const clone = formContainer.cloneNode(true) as Element;
  clone.querySelector('label')?.remove();
  return {
    value: clone.textContent?.trim() || '',
    valueElement: formContainer as HTMLElement,
    valueType: 'string',
  };
}

function shouldSkipLabeledField(
  container: HTMLElement,
  labelEl: HTMLLabelElement,
  processedElements: Set<Element>
) {
  return (
    processedElements.has(labelEl) ||
    isForeignVirtualIframeDescendant(container, labelEl) ||
    Boolean(labelEl.closest(ATTR_WIDE_SELECTOR)) ||
    isRichTextEditorChromeElement(labelEl)
  );
}

function resolveParsedLabeledFieldValue(
  labelEl: HTMLLabelElement,
  processedElements: Set<Element>
) {
  let resolved: ResolvedFieldValue = resolveLabeledInputValue(labelEl, processedElements);
  let linkRef: string | undefined;

  if (!resolved.value) {
    resolved = resolveNestedFieldValue(labelEl, processedElements);
  }
  if (!resolved.value) {
    resolved = resolveSiblingFieldValue(labelEl, processedElements);
  }
  if (!resolved.value) {
    const linkValue = resolveContainerLinkValue(labelEl, processedElements);
    resolved = {
      value: linkValue.value,
      valueElement: linkValue.valueElement,
      valueType: linkValue.valueType,
    };
    linkRef = linkValue.linkRef;
  }
  if (!resolved.value) {
    resolved = resolveContainerTextValue(labelEl);
  }

  return { linkRef, resolved };
}

function parseLabeledField(
  container: HTMLElement,
  labelEl: HTMLLabelElement,
  ctx: TraversalContext,
  processedElements: Set<Element>
) {
  if (shouldSkipLabeledField(container, labelEl, processedElements)) {
    return null;
  }

  const label = extractCleanText(labelEl).replace(/[:\s]+$/, '');
  if (!label) {
    return null;
  }
  if (shouldSkipSensitiveLabeledField(labelEl, label)) {
    processedElements.add(labelEl);
    return null;
  }

  const { linkRef, resolved } = resolveParsedLabeledFieldValue(labelEl, processedElements);
  if (!resolved.value || !resolved.valueElement) {
    return null;
  }

  processedElements.add(labelEl);
  return buildFieldNode({
    ctx,
    label,
    linkRef,
    sourceElement: resolved.valueElement,
    value: resolved.value,
    valueType: resolved.valueType,
  });
}

export function parseLabeledFormFields(
  container: HTMLElement,
  ctx: TraversalContext,
  processedElements: Set<Element>
): FieldNode[] {
  return Array.from(container.querySelectorAll('label'))
    .map((labelEl) =>
      parseLabeledField(container, labelEl as HTMLLabelElement, ctx, processedElements)
    )
    .filter((field): field is FieldNode => field !== null);
}
