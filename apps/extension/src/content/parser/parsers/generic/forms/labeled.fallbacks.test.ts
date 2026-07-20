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

function registerSiblingFallbackTests() {
  it('falls back to sibling select and contenteditable values when no linked input is present', () => {
    const container = document.createElement('div');

    const selectLabel = document.createElement('label');
    selectLabel.textContent = 'Priority';
    const select = document.createElement('select');
    const lowOption = document.createElement('option');
    lowOption.textContent = 'Low';
    const highOption = document.createElement('option');
    highOption.textContent = 'High';
    highOption.selected = true;
    select.append(lowOption, highOption);

    const editorLabel = document.createElement('label');
    editorLabel.textContent = 'Comment';
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.textContent = 'Rich inline comment';

    container.append(selectLabel, select, editorLabel, editor);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Priority',
          value: 'High',
          valueType: 'string',
        }),
        expect.objectContaining({
          label: 'Comment',
          value: 'Rich inline comment',
          valueType: 'string',
        }),
      ])
    );
  });
}

function registerSiblingSkipAheadFallbackTest() {
  it('skips non-value siblings until it finds the next form control', () => {
    const container = document.createElement('div');
    const label = document.createElement('label');
    label.textContent = 'Description';
    const spacer = document.createElement('span');
    spacer.textContent = 'Ignored helper text';
    const textarea = document.createElement('textarea');
    textarea.value = 'Recovered after spacer';
    container.append(label, spacer, textarea);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Description',
        value: 'Recovered after spacer',
        valueType: 'string',
      }),
    ]);
  });
}

function registerContainerLinkFallbackTest() {
  it('falls back to container links when no input value exists', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.textContent = 'Open ticket';
    const link = document.createElement('a');
    link.href = 'https://example.test/ticket/42';
    link.textContent = 'Ticket 42';
    field.append(label, link);
    container.append(field);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Open ticket',
      valueType: 'link',
    });
    expect(fields[0]?.value).toContain('Ticket 42');
  });
}

function registerProcessedLinkFallbackTest() {
  it('falls back to container text when the container link is already processed', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('label');
    label.textContent = 'Open ticket';
    const link = document.createElement('a');
    link.href = 'https://example.test/ticket/42';
    link.textContent = 'Ticket 42';
    const suffix = document.createElement('span');
    suffix.textContent = 'Ticket 42 pending approval';
    field.append(label, link, suffix);
    container.append(field);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>([link])
    );

    expect(fields).toEqual([
      expect.objectContaining({
        label: 'Open ticket',
        value: 'Ticket 42Ticket 42 pending approval',
        valueType: 'string',
      }),
    ]);
  });
}

function registerContainerTextFallbackTest() {
  it('falls back to container text without duplicating the label when no inputs or links exist', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'form-field';
    const label = document.createElement('label');
    label.textContent = 'Summary';
    const value = document.createElement('span');
    value.textContent = 'Canonical summary text';
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Summary',
      value: 'Canonical summary text',
      valueType: 'string',
    });
  });
}

function registerMissingInputFallbackTest() {
  it('falls back to container text when a linked input is missing', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'form-field';
    const label = document.createElement('label');
    label.setAttribute('for', 'field-missing');
    label.textContent = 'Fallback';
    const value = document.createElement('span');
    value.textContent = 'Recovered from text';
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([
      expect.objectContaining({ label: 'Fallback', value: 'Recovered from text' }),
    ]);
  });
}

describe('parseLabeledFormFields fallback resolution', () => {
  registerSiblingFallbackTests();
  registerSiblingSkipAheadFallbackTest();
  registerContainerLinkFallbackTest();
  registerProcessedLinkFallbackTest();
  registerContainerTextFallbackTest();
  registerMissingInputFallbackTest();
});
