// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import { applyEditToElement } from './element';
import { updateTextPreservingStructure } from './structure';

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

describe('ai-pick dom-apply text helpers', () => {
  it('updates the deepest structured text leaf without removing wrappers', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="FormField-EA__controlBox">
        <div class="FormField-EA__control">
          <div class="DynamicValue__layout">
            <div class="DynamicValue__content">
              <span class="stringView">Initial</span>
            </div>
          </div>
        </div>
      </div>
    `;

    updateTextPreservingStructure(container, 'Updated');

    expect(container.querySelector('.stringView')?.textContent).toBe('Updated');
    expect(container.querySelector('.DynamicValue__content')).not.toBeNull();
  });

  it('preserves composite labels by updating only the editable tail', () => {
    const element = document.createElement('span');
    const separator = document.createElement('span');
    separator.className = 'TextBoxWithIcon__separator';
    separator.textContent = 'Initial';
    element.append('Дата создания: ', separator);

    applyEditToElement(element, 'Updated', createStringNode('Дата создания'));

    expect(element.textContent).toBe('Дата создания: Updated');
    expect(separator.textContent).toBe('Updated');
  });

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
});
