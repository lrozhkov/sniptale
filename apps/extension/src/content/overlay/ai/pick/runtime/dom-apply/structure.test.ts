// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { updateTextPreservingStructure } from './structure';

describe('ai-pick dom-apply structure helpers', () => {
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

  it('does not overwrite complex structure leaves', () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="FormField-EA__controlBox">
        <div class="FormField-EA__control">
          <img alt="avatar" />
          <span class="stringView">Initial</span>
        </div>
      </div>
    `;

    updateTextPreservingStructure(container, 'Updated');

    expect(container.querySelector('.stringView')?.textContent).toBe('Updated');
    expect(container.querySelector('img')).not.toBeNull();
  });
});
