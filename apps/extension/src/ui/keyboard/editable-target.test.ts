// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { isEditableElementTarget } from './editable-target';

describe('isEditableElementTarget', () => {
  it.each(['input', 'textarea', 'select'])('accepts a %s control', (tagName) => {
    expect(isEditableElementTarget(document.createElement(tagName))).toBe(true);
  });

  it('accepts role textbox and nested contenteditable targets', () => {
    const textbox = document.createElement('div');
    const editableRoot = document.createElement('div');
    const nestedTarget = document.createElement('span');
    textbox.setAttribute('role', 'textbox');
    editableRoot.setAttribute('contenteditable', 'true');
    editableRoot.append(nestedTarget);

    expect(isEditableElementTarget(textbox)).toBe(true);
    expect(isEditableElementTarget(nestedTarget)).toBe(true);
  });

  it('rejects non-element and ordinary element targets', () => {
    expect(isEditableElementTarget(null)).toBe(false);
    expect(isEditableElementTarget(document.createTextNode('text'))).toBe(false);
    expect(isEditableElementTarget(document.createElement('button'))).toBe(false);
  });
});
