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

function registerCanonicalPairTest() {
  it('parses canonical label/value pairs', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'field';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Status:';
    const value = document.createElement('div');
    value.className = 'value';
    value.textContent = 'Open';
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Status',
      value: 'Open',
      valueType: 'string',
    });
  });
}

function registerFallbackChildrenTest() {
  it('falls back to the first two readable children when selector matches are absent', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'property';
    const label = document.createElement('div');
    label.textContent = 'Owner';
    const value = document.createElement('div');
    value.textContent = 'Operations';
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Owner',
      value: 'Operations',
      valueType: 'string',
    });
  });
}

function registerLinkValueTest() {
  it('parses anchor-backed values as links', () => {
    const container = document.createElement('div');
    const field = document.createElement('div');
    field.className = 'form-field';
    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Reference';
    const value = document.createElement('div');
    value.className = 'value';
    const link = document.createElement('a');
    link.href = 'https://example.test/reference';
    link.textContent = 'REF-42';
    value.append(link);
    field.append(label, value);
    container.append(field);
    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      label: 'Reference',
      value: 'REF-42',
      valueType: 'link',
      linkRef: 'https://example.test/reference',
    });
  });
}

function appendPortalField(root: Element, labelText: string, valueText: string) {
  const field = document.createElement('div');
  field.className = 'field';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = labelText;
  const value = document.createElement('div');
  value.className = 'value';
  value.textContent = valueText;
  field.append(label, value);
  root.append(field);

  return field;
}

function registerPortalPreviewSkipTest() {
  it('skips portal homepage preview property containers', () => {
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';
    const field = appendPortalField(mainRoot, 'Preview only', 'Ignore');
    field.className = 'ServiceCall__propertyContainer field';
    document.body.append(mainRoot);

    const fields = parseKeyValueFields(
      mainRoot,
      createParserContext('https://example.test/portal/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
  });

  it('skips portal footer descendants by canonical page metadata', () => {
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';
    const footer = document.createElement('div');
    footer.className = 'Footer__footerBlock';
    appendPortalField(footer, 'Portal link', 'Ignore me');
    mainRoot.append(footer);
    document.body.append(mainRoot);

    const fields = parseKeyValueFields(
      mainRoot,
      createParserContext('https://example.test/portal/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
  });
}

function registerFallbackSkipBranchesTest() {
  it('skips attrWide fallback containers, processed elements, and duplicate label/value rows', () => {
    const container = document.createElement('div');

    const attrWideWrapper = document.createElement('td');
    attrWideWrapper.className = 'attrWide';
    const attrWideField = document.createElement('div');
    attrWideField.className = 'property';
    const attrWideLabel = document.createElement('div');
    attrWideLabel.textContent = 'Wide only';
    const attrWideValue = document.createElement('div');
    attrWideValue.textContent = 'Do not parse';
    attrWideField.append(attrWideLabel, attrWideValue);
    attrWideWrapper.append(attrWideField);
    container.append(attrWideWrapper);

    const processedField = document.createElement('div');
    processedField.className = 'field';
    const processedLabel = document.createElement('div');
    processedLabel.className = 'label';
    processedLabel.textContent = 'Processed';
    const processedValue = document.createElement('div');
    processedValue.className = 'value';
    processedValue.textContent = 'Skip';
    processedField.append(processedLabel, processedValue);
    container.append(processedField);

    const duplicateField = document.createElement('div');
    duplicateField.className = 'field';
    const duplicateLabel = document.createElement('div');
    duplicateLabel.className = 'label';
    duplicateLabel.textContent = 'Owner';
    const duplicateValue = document.createElement('div');
    duplicateValue.className = 'value';
    duplicateValue.textContent = 'Owner';
    duplicateField.append(duplicateLabel, duplicateValue);
    container.append(duplicateField);

    document.body.append(container);

    const ctx = createParserContext('https://example.test/form/', createParserSection());
    ctx.processedFieldElements.add(processedLabel);

    const fields = parseKeyValueFields(container, ctx, new Set<Element>());

    expect(fields).toEqual([]);
  });
}

function registerAttrListAndIframeSkipBranchesTest() {
  it('skips attrList caption/value pairs and foreign virtual iframe fields', () => {
    const container = document.createElement('div');

    const attrList = document.createElement('table');
    attrList.className = 'attrList';
    const attrListField = document.createElement('div');
    attrListField.className = 'field';
    const attrListLabel = document.createElement('div');
    attrListLabel.className = 'label';
    attrListLabel.id = 'status-caption';
    attrListLabel.textContent = 'Status';
    const attrListValue = document.createElement('div');
    attrListValue.className = 'value';
    attrListValue.id = 'status-value';
    attrListValue.textContent = 'Open';
    attrListField.append(attrListLabel, attrListValue);
    attrList.append(attrListField);
    container.append(attrList);

    const virtualField = document.createElement('div');
    virtualField.className = 'field';
    virtualField.setAttribute('data-virtual-iframe', 'true');
    const virtualLabel = document.createElement('div');
    virtualLabel.className = 'label';
    virtualLabel.textContent = 'Nested';
    const virtualValue = document.createElement('div');
    virtualValue.className = 'value';
    virtualValue.textContent = 'Iframe value';
    virtualField.append(virtualLabel, virtualValue);
    container.append(virtualField);

    document.body.append(container);

    const fields = parseKeyValueFields(
      container,
      createParserContext('https://example.test/form/', createParserSection()),
      new Set<Element>()
    );

    expect(fields).toEqual([]);
  });
}

describe('parseKeyValueFields', () => {
  registerCanonicalPairTest();
  registerFallbackChildrenTest();
  registerLinkValueTest();
  registerPortalPreviewSkipTest();
  registerFallbackSkipBranchesTest();
  registerAttrListAndIframeSkipBranchesTest();
});
