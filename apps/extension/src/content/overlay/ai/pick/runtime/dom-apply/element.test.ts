// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { applyEditToElement } from './element';

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

describe('ai-pick dom-apply element helpers', () => {
  it('skips image and status fields entirely', () => {
    const imageElement = document.createElement('div');
    imageElement.textContent = 'Initial image text';
    const statusElement = document.createElement('div');
    statusElement.textContent = 'Initial status text';

    applyEditToElement(imageElement, 'Updated image', createStringNode('Фото', 'image'));
    applyEditToElement(statusElement, 'Updated status', createStringNode('Статус', 'status'));

    expect(imageElement.textContent).toBe('Initial image text');
    expect(statusElement.textContent).toBe('Initial status text');
  });

  it('updates a nested link through the shared structure updater', () => {
    const element = document.createElement('div');
    const link = document.createElement('a');
    link.textContent = 'Initial';
    element.append(link);

    applyEditToElement(element, 'Updated', createStringNode('Стоимость', 'link'));

    expect(link.textContent).toBe('Updated');
  });
});
