// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { preserveCompositeLabelText } from './label';

function createStringNode(label: string, valueType: FieldNode['valueType'] = 'string'): FieldNode {
  return {
    id: 'field-1',
    label,
    selected: true,
    type: 'field',
    value: 'Initial',
    valueType,
  };
}

function applyCompositeLabelEdit(element: HTMLElement, newValue = 'Updated') {
  return preserveCompositeLabelText(element, newValue, createStringNode('Дата создания'));
}

function createSeparatorElement() {
  const element = document.createElement('span');
  const separator = document.createElement('span');
  separator.className = 'TextBoxWithIcon__separator';
  separator.textContent = 'Initial';
  element.append('Дата создания: ', separator);
  return { element, separator };
}

function createTitleFallbackElement() {
  const element = document.createElement('span');
  element.setAttribute('title', 'Дата создания: Initial');
  element.textContent = 'Initial';
  return element;
}

function createDirectLabelElement() {
  const element = document.createElement('span');
  const value = document.createElement('span');
  value.textContent = 'Initial';
  element.append('Дата создания: ', value);
  return { element, value };
}

function createFallbackTextElement() {
  const element = document.createElement('span');
  element.append('Дата создания: ');
  return element;
}

describe('ai-pick dom-apply label helpers', () => {
  it('preserves composite labels by updating only the editable tail', () => {
    const { element, separator } = createSeparatorElement();
    const applied = applyCompositeLabelEdit(element);

    expect(applied).toBe(true);
    expect(element.textContent).toBe('Дата создания: Updated');
    expect(separator.textContent).toBe('Updated');
  });

  it('uses the title prefix fallback when a bare element has no children', () => {
    const element = createTitleFallbackElement();
    const applied = applyCompositeLabelEdit(element);

    expect(applied).toBe(true);
    expect(element.textContent).toBe('Дата создания: Updated');
  });

  it('updates the last child when a direct label node is present without a separator', () => {
    const { element, value } = createDirectLabelElement();
    const applied = applyCompositeLabelEdit(element);

    expect(applied).toBe(true);
    expect(element.childNodes[0]?.textContent).toBe('Дата создания: ');
    expect(value.textContent).toBe('Updated');
  });

  it('falls back to replacing text when no child element remains editable', () => {
    const element = createFallbackTextElement();
    const applied = applyCompositeLabelEdit(element);

    expect(applied).toBe(true);
    expect(element.textContent).toBe('Дата создания: Updated');
  });

  it('returns false when the element does not preserve the label prefix', () => {
    const element = document.createElement('span');
    element.textContent = 'Unrelated text';

    const applied = preserveCompositeLabelText(element, 'Updated', createStringNode('Дата'));

    expect(applied).toBe(false);
    expect(element.textContent).toBe('Unrelated text');
  });
});
