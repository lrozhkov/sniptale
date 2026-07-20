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

function registerReferencedCheckboxTest() {
  it('parses checkbox inputs referenced by label[for] as boolean fields', () => {
    const container = document.createElement('div');
    const label = document.createElement('label');
    label.setAttribute('for', 'field-enabled');
    label.textContent = 'Enabled:';
    const input = document.createElement('input');
    input.id = 'field-enabled';
    input.type = 'checkbox';
    input.checked = true;
    container.append(label, input);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Enabled',
      value: 'да',
      valueType: 'boolean',
    });
  });
}

function registerNumericInputTest() {
  it('parses number inputs referenced by label[for] as numeric fields', () => {
    const container = document.createElement('div');
    const label = document.createElement('label');
    label.setAttribute('for', 'field-count');
    label.textContent = 'Count';
    const input = document.createElement('input');
    input.id = 'field-count';
    input.type = 'number';
    input.value = '42';
    container.append(label, input);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Count',
      value: '42',
      valueType: 'number',
    });
  });
}

function registerReferencedRadioAndTextareaTest() {
  it('parses unchecked radio inputs and textarea values referenced by label[for]', () => {
    const container = document.createElement('div');
    const radioLabel = document.createElement('label');
    radioLabel.setAttribute('for', 'field-radio');
    radioLabel.textContent = 'Enabled';
    const radio = document.createElement('input');
    radio.id = 'field-radio';
    radio.type = 'radio';
    radio.checked = false;
    const textareaLabel = document.createElement('label');
    textareaLabel.setAttribute('for', 'field-notes');
    textareaLabel.textContent = 'Notes';
    const textarea = document.createElement('textarea');
    textarea.id = 'field-notes';
    textarea.value = 'Canonical notes';
    container.append(radioLabel, radio, textareaLabel, textarea);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Enabled',
          value: 'нет',
          valueType: 'boolean',
        }),
        expect.objectContaining({
          label: 'Notes',
          value: 'Canonical notes',
          valueType: 'string',
        }),
      ])
    );
  });
}

function registerNestedInputFallbackTest() {
  it('falls back to nested inputs inside form containers', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'form-group';
    const label = document.createElement('label');
    label.textContent = 'Cost';
    const input = document.createElement('input');
    input.value = '1500';
    field.append(label, input);
    container.append(field);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Cost',
      value: '1500',
      valueType: 'string',
    });
  });
}

function registerSensitiveFieldTests() {
  it('omits labeled password and token fields before reading them into parser evidence', () => {
    const container = document.createElement('div');
    const passwordLabel = document.createElement('label');
    passwordLabel.setAttribute('for', 'field-password');
    passwordLabel.textContent = 'Password';
    const password = document.createElement('input');
    password.id = 'field-password';
    password.type = 'password';
    password.value = 'visible-secret';
    const tokenLabel = document.createElement('label');
    tokenLabel.textContent = 'API token';
    const tokenInput = document.createElement('input');
    tokenInput.value = 'token-secret';
    container.append(passwordLabel, password, tokenLabel, tokenInput);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
    expect(JSON.stringify(fields)).not.toContain('visible-secret');
    expect(JSON.stringify(fields)).not.toContain('token-secret');
  });

  it('omits OTP controls even when the visible label is generic', () => {
    const container = document.createElement('div');
    const label = document.createElement('label');
    label.setAttribute('for', 'field-code');
    label.textContent = 'Code';
    const input = document.createElement('input');
    input.id = 'field-code';
    input.autocomplete = 'one-time-code';
    input.value = '123456';
    container.append(label, input);
    document.body.append(container);

    const fields = parseLabeledFormFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
    expect(JSON.stringify(fields)).not.toContain('123456');
  });
}

describe('parseLabeledFormFields', () => {
  registerReferencedCheckboxTest();
  registerNumericInputTest();
  registerReferencedRadioAndTextareaTest();
  registerNestedInputFallbackTest();
  registerSensitiveFieldTests();
});
