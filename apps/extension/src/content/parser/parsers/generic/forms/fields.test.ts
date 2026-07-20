// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';
import {
  createParserContext,
  createParserSection,
} from '../../../../../../../../tooling/test/support/content/parsers/generic/form-fields';
import { FormFieldsParser } from './fields';

afterEach(() => {
  document.body.replaceChildren();
});

function registerFieldContainerRecognitionTest() {
  it('recognizes field containers and rejects button surfaces', () => {
    const parser = new FormFieldsParser();
    const fieldContainer = document.createElement('div');
    fieldContainer.className = 'form-group';
    fieldContainer.append(document.createElement('input'));

    const button = document.createElement('button');
    button.textContent = 'Save';

    expect(parser.canParse(fieldContainer, createParserContext())).toBe(true);
    expect(parser.canParse(button, createParserContext())).toBe(false);
  });
}

function registerCanParseSkipSurfaceTests() {
  it('rejects elements inside toolbar containers and portal-skipped surfaces', () => {
    const parser = new FormFieldsParser();
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    const nestedField = document.createElement('div');
    nestedField.append(document.createElement('input'));
    toolbar.append(nestedField);

    const portalRoot = document.createElement('div');
    portalRoot.className = 'Main__root';
    const searchBlock = document.createElement('div');
    searchBlock.className = 'SearchBlock__root';
    searchBlock.append(document.createElement('input'));
    portalRoot.append(searchBlock);
    document.body.append(portalRoot);

    expect(parser.canParse(nestedField, createParserContext())).toBe(false);
    expect(
      parser.canParse(
        searchBlock,
        createParserContext('https://example.test/portal/', createParserSection())
      )
    ).toBe(false);
  });

  it('rejects elements inside actions and gwt tool panels', () => {
    const parser = new FormFieldsParser();

    const actions = document.createElement('div');
    actions.className = 'actions';
    const actionsField = document.createElement('div');
    actionsField.append(document.createElement('input'));
    actions.append(actionsField);

    const toolPanel = document.createElement('div');
    toolPanel.className = 'gwt-ToolPanel';
    const toolPanelField = document.createElement('div');
    toolPanelField.append(document.createElement('input'));
    toolPanel.append(toolPanelField);

    expect(parser.canParse(actionsField, createParserContext())).toBe(false);
    expect(parser.canParse(toolPanelField, createParserContext())).toBe(false);
  });
}

function registerExistingSectionParseTest() {
  it('parses into an existing section without creating a duplicate form section', () => {
    const parser = new FormFieldsParser();
    const existingSection = createParserSection('Existing section');
    const ctx = createParserContext('https://example.test/form/', existingSection);

    const container = document.createElement('div');
    const label = document.createElement('label');
    label.setAttribute('for', 'field-status');
    label.textContent = 'Status';
    const input = document.createElement('input');
    input.id = 'field-status';
    input.value = 'Open';
    const property = document.createElement('div');
    property.className = 'field';
    const propertyLabel = document.createElement('div');
    propertyLabel.className = 'label';
    propertyLabel.textContent = 'Owner';
    const propertyValue = document.createElement('div');
    propertyValue.className = 'value';
    propertyValue.textContent = 'Support';
    property.append(propertyLabel, propertyValue);
    container.append(label, input, property);
    document.body.append(container);

    const result = parser.parse(container, ctx);
    const parsedFields = ctx.currentSection?.children.filter(
      (child): child is FieldNode => child.type === 'field'
    );

    expect(result.fields).toHaveLength(2);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Existing section');
    expect(parsedFields?.map((field) => field.label)).toEqual(['Status', 'Owner']);
  });
}

function registerOrphanSectionCreationTest() {
  it('creates an orphan section from the nearest heading when parsing detached form content', () => {
    const parser = new FormFieldsParser();
    const ctx = createParserContext();
    const container = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'Billing form';
    const label = document.createElement('label');
    label.setAttribute('for', 'field-cost');
    label.textContent = 'Cost';
    const input = document.createElement('input');
    input.id = 'field-cost';
    input.value = '1500';
    container.append(heading, label, input);
    document.body.append(container);

    const result = parser.parse(container, ctx);

    expect(result.fields).toHaveLength(1);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Billing form');
    expect(ctx.currentSection?.children[0]).toMatchObject({
      label: 'Cost',
      value: '1500',
    });
  });
}

function registerDefaultTitleFallbackTest() {
  it('falls back to the default section title when heading text is too long', () => {
    const parser = new FormFieldsParser();
    const ctx = createParserContext();
    const container = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'Long heading '.repeat(12);
    const label = document.createElement('label');
    label.setAttribute('for', 'field-name');
    label.textContent = 'Name';
    const input = document.createElement('input');
    input.id = 'field-name';
    input.value = 'Alice';
    container.append(heading, label, input);

    parser.parse(container, ctx);

    expect(ctx.currentSection?.title).toBe('Форма');
  });
}

function registerPortalSkipParseTest() {
  it('returns an empty result when parsing a portal-skipped container directly', () => {
    const parser = new FormFieldsParser();
    const existingSection = createParserSection('Portal shell');
    const ctx = createParserContext('https://example.test/portal/', existingSection);
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';
    const searchBlock = document.createElement('div');
    searchBlock.className = 'SearchBlock__root';
    const label = document.createElement('label');
    label.textContent = 'Search label';
    const input = document.createElement('input');
    input.value = 'Ignored';
    searchBlock.append(label, input);
    mainRoot.append(searchBlock);
    document.body.append(mainRoot);

    expect(parser.parse(searchBlock, ctx)).toEqual({});
    expect(existingSection.children).toEqual([]);
  });
}

describe('FormFieldsParser', () => {
  registerFieldContainerRecognitionTest();
  registerCanParseSkipSurfaceTests();
  registerExistingSectionParseTest();
  registerOrphanSectionCreationTest();
  registerDefaultTitleFallbackTest();
  registerPortalSkipParseTest();
});
