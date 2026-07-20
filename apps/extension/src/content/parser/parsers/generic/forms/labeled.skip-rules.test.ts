// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import {
  createParserContext,
  createParserSection,
} from '../../../../../../../../tooling/test/support/content/parsers/generic/form-fields';
import { parseLabeledFormFields } from './labeled.helpers';

afterEach(() => {
  document.body.replaceChildren();
});

function createSkipRuleContainer() {
  const container = document.createElement('div');
  const processedLabel = document.createElement('label');
  processedLabel.textContent = 'Processed';

  const attrWideCell = document.createElement('td');
  attrWideCell.className = 'attrWide';
  const attrWideLabel = document.createElement('label');
  attrWideLabel.textContent = 'Attr wide';
  attrWideCell.append(attrWideLabel);
  const attrWideWrapper = document.createElement('table');
  const attrWideRow = document.createElement('tr');
  attrWideRow.append(attrWideCell);
  attrWideWrapper.append(attrWideRow);

  const iframeScope = document.createElement('div');
  iframeScope.setAttribute('data-virtual-iframe', 'true');
  const virtualIframeLabel = document.createElement('label');
  virtualIframeLabel.textContent = 'Iframe';
  iframeScope.append(virtualIframeLabel);

  const richTextWrapper = document.createElement('div');
  richTextWrapper.className = 'form-field note-editor';
  const richTextLabel = document.createElement('label');
  richTextLabel.setAttribute('for', 'field-rich');
  richTextLabel.textContent = 'Rich text';
  const richTextInput = document.createElement('input');
  richTextInput.id = 'field-rich';
  richTextInput.value = 'Ignored';
  richTextWrapper.append(richTextLabel, richTextInput);

  container.append(processedLabel, attrWideWrapper, iframeScope, richTextWrapper);
  document.body.append(container);

  return { container, processedLabel };
}

function parseFields(container: HTMLElement, processedElements = new Set<Element>()) {
  return parseLabeledFormFields(
    container,
    createParserContext('https://example.test/form/', createParserSection()),
    processedElements
  );
}

function createEmptyLabelContainer() {
  const container = document.createElement('div');
  const blankLabel = document.createElement('label');
  blankLabel.textContent = '   ';

  const labelOnlyField = document.createElement('div');
  labelOnlyField.className = 'form-field';
  const valueLessLabel = document.createElement('label');
  valueLessLabel.textContent = 'Value-less';
  labelOnlyField.append(valueLessLabel);

  container.append(blankLabel, labelOnlyField);
  document.body.append(container);

  return container;
}

function createRichTextInputContainer() {
  const container = document.createElement('div');
  const label = document.createElement('label');
  label.setAttribute('for', 'rich-editor-input');
  label.textContent = 'Rich editor';

  const richTextWrapper = document.createElement('div');
  richTextWrapper.className = 'note-editor';
  const richTextInput = document.createElement('input');
  richTextInput.id = 'rich-editor-input';
  richTextInput.value = 'Ignore rich editor chrome';
  richTextWrapper.append(richTextInput);

  container.append(label, richTextWrapper);
  document.body.append(container);

  return container;
}

describe('parseLabeledFormFields skip rules', () => {
  it('skips processed labels, attrWide labels, foreign virtual iframe labels, and rich-text chrome inputs', () => {
    const { container, processedLabel } = createSkipRuleContainer();
    const fields = parseFields(container, new Set<Element>([processedLabel]));

    expect(fields).toEqual([]);
  });

  it('skips empty labels and labels without recoverable values', () => {
    const fields = parseFields(createEmptyLabelContainer());

    expect(fields).toEqual([]);
  });

  it('skips labels whose referenced input lives inside rich-text chrome', () => {
    const fields = parseFields(createRichTextInputContainer());

    expect(fields).toEqual([]);
  });
});
