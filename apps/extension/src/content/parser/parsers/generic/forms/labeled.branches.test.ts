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

function parseFields(container: HTMLElement, processed = new Set<Element>()) {
  return parseLabeledFormFields(
    container,
    createParserContext('https://example.test/form/', createParserSection()),
    processed
  );
}

function appendRecoveredTextField(container: HTMLElement) {
  const field = document.createElement('div');
  field.className = 'form-field';
  const label = document.createElement('label');
  label.setAttribute('for', 'field-empty-text');
  label.textContent = 'Text fallback';
  const input = document.createElement('input');
  input.id = 'field-empty-text';
  input.value = '   ';
  const value = document.createElement('span');
  value.textContent = 'Recovered text';
  field.append(label, input, value);
  container.append(field);
}

function appendSelectFallbackField(container: HTMLElement) {
  const field = document.createElement('div');
  field.className = 'form-field';
  const label = document.createElement('label');
  label.textContent = 'Priority';
  const select = document.createElement('select');
  const option = document.createElement('option');
  option.value = 'fallback-value';
  option.textContent = '';
  option.selected = true;
  select.append(option);
  field.append(label, select);
  container.append(field);
}

function appendRecoveredTextareaField(container: HTMLElement) {
  const field = document.createElement('div');
  field.className = 'form-field';
  const label = document.createElement('label');
  label.setAttribute('for', 'field-notes');
  label.textContent = 'Notes';
  const textarea = document.createElement('textarea');
  textarea.id = 'field-notes';
  textarea.value = '   ';
  const value = document.createElement('span');
  value.textContent = 'Recovered notes';
  field.append(label, textarea, value);
  container.append(field);
}

function appendRecoveredEditableField(container: HTMLElement) {
  const field = document.createElement('div');
  field.className = 'form-field';
  const label = document.createElement('label');
  label.textContent = 'Comment';
  const editor = document.createElement('div');
  editor.setAttribute('contenteditable', 'true');
  editor.textContent = '   ';
  const value = document.createElement('span');
  value.textContent = 'Recovered comment';
  field.append(label, editor, value);
  container.append(field);
}

function buildInputValueFallbackContainer() {
  const container = document.createElement('div');
  appendRecoveredTextField(container);
  appendSelectFallbackField(container);
  appendRecoveredTextareaField(container);
  appendRecoveredEditableField(container);
  document.body.append(container);
  return container;
}

function registerInputValueFallbackTests() {
  it('falls back from empty referenced controls to later container text recovery paths', () => {
    const fields = parseFields(buildInputValueFallbackContainer());

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Text fallback', value: 'Recovered text' }),
        expect.objectContaining({
          label: 'Priority',
          value: 'fallback-value',
          valueType: 'string',
        }),
        expect.objectContaining({ label: 'Notes', value: 'Recovered notes' }),
        expect.objectContaining({ label: 'Comment', value: 'Recovered comment' }),
      ])
    );
  });
}

function registerRichTextChromeFallbackTests() {
  it('returns no field when nested, link, and text fallbacks are blocked by rich-text chrome', () => {
    const container = document.createElement('div');

    const nestedField = document.createElement('div');
    nestedField.className = 'form-field note-editor';
    const nestedLabel = document.createElement('label');
    nestedLabel.textContent = 'Nested rich text';
    const nestedInput = document.createElement('input');
    nestedInput.value = 'Ignored';
    nestedField.append(nestedLabel, nestedInput);

    const linkField = document.createElement('div');
    linkField.className = 'form-field note-editor';
    const linkLabel = document.createElement('label');
    linkLabel.textContent = 'Link rich text';
    const link = document.createElement('a');
    link.href = 'https://example.test/editor';
    link.textContent = 'Ignored link';
    linkField.append(linkLabel, link);

    const textField = document.createElement('div');
    textField.className = 'form-field note-editor';
    const textLabel = document.createElement('label');
    textLabel.textContent = 'Text rich text';
    const textValue = document.createElement('span');
    textValue.textContent = 'Ignored text';
    textField.append(textLabel, textValue);

    container.append(nestedField, linkField, textField);
    document.body.append(container);

    expect(parseFields(container)).toEqual([]);
  });
}

describe('parseLabeledFormFields branch coverage', () => {
  registerInputValueFallbackTests();
  registerRichTextChromeFallbackTests();
});
