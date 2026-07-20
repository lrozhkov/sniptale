// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import {
  createParserContext,
  createParserSection,
} from '../../../../../../../../tooling/test/support/content/parsers/generic/form-fields';
import { parseKeyValueFields } from './key-value.helpers';

afterEach(() => {
  document.body.replaceChildren();
});

function registerAttrListFallbackChildrenSkipTest() {
  it('skips fallback child pairs that live inside attrList tables even without label/value classes', () => {
    const container = document.createElement('table');
    container.className = 'attrList';
    const row = document.createElement('div');
    row.className = 'property';
    const label = document.createElement('div');
    label.textContent = 'Attr list fallback';
    const value = document.createElement('div');
    value.textContent = 'Ignored';
    row.append(label, value);
    container.append(row);
    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
  });
}

function registerEmptyValueSkipTest() {
  it('skips rows whose normalized value becomes empty after trimming', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Empty';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = '   ';
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
  });
}

describe('parseKeyValueFields fallback branches', () => {
  registerAttrListFallbackChildrenSkipTest();
  registerEmptyValueSkipTest();
});
