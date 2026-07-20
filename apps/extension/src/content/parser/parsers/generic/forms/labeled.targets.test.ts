// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { findElementByIdInLabelRoot } from './labeled.targets';

describe('form-fields labeled targets', () => {
  it('resolves labeled controls from the owner document by id', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'field-id');
    const input = document.createElement('input');
    input.id = 'field-id';
    document.body.append(label, input);

    expect(findElementByIdInLabelRoot(label, 'field-id')).toBe(input);
  });

  it('resolves labeled controls inside the same shadow root', () => {
    const host = document.createElement('div');
    const shadowRoot = host.attachShadow({ mode: 'open' });
    const label = document.createElement('label');
    label.setAttribute('for', 'shadow-field');
    const input = document.createElement('input');
    input.id = 'shadow-field';
    shadowRoot.append(label, input);
    document.body.append(host);

    expect(findElementByIdInLabelRoot(label, 'shadow-field')).toBe(input);
  });
});
