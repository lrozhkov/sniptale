// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { initContext } from '../../../dom-tree-parser/traversal';
import {
  DynamicFieldsEmbeddedAppParser,
  parseDynamicFieldsEmbeddedAppElement,
} from './dynamic-fields-app';

afterEach(() => {
  document.body.replaceChildren();
});

function createParserContext() {
  return initContext({
    appFamily: 'naumen-sd',
    confidence: 0.99,
    matchedSignals: [],
    pageKind: 'object-card-with-dynamic-fields',
    pipelineId: 'naumen-sd-gwt',
    preferredRoots: ['body'],
    vendor: 'naumen-sd-gwt',
  });
}

function createDynamicFieldsContainer(value: string): HTMLElement {
  const container = document.createElement('div');
  container.setAttribute('data-virtual-iframe', 'true');
  container.setAttribute('data-application-code', 'dynamicFields');
  container.id = 'virtual-dynamic-fields';
  container.innerHTML = `
    <div class="FormField-EA__field FormField-EA__fieldRead">
      <div class="FormField-EA__fieldInfo"><label>Стоимость</label></div>
      <div class="FormField-EA__fieldBody">
        <div class="FormField-EA__controlBox">
          <div class="FormField-EA__control"><span class="MaskedField-EA__value">${value}</span></div>
        </div>
      </div>
    </div>
  `;
  document.body.append(container);
  return container;
}

function runSectionAppendTest() {
  it('appends parsed fields into an existing titled section helper seam', () => {
    const container = createDynamicFieldsContainer('800');
    const ctx = createParserContext();
    ctx.result.structure.push({
      children: [
        {
          id: 'existing-field',
          label: 'Исходное поле',
          selected: true,
          type: 'field',
          value: '1',
          valueType: 'string',
        },
      ],
      id: 'additional-params',
      selected: true,
      title: 'Дополнительные параметры',
      type: 'section',
    });

    parseDynamicFieldsEmbeddedAppElement(container, ctx);

    expect(ctx.result.structure[0]?.children).toEqual([
      expect.objectContaining({ label: 'Исходное поле' }),
      expect.objectContaining({ label: 'Стоимость', value: '800' }),
    ]);
  });
}

function runParserDelegationTest() {
  it('delegates parser.parse through the same append section seam', () => {
    const container = createDynamicFieldsContainer('900');
    const parser = new DynamicFieldsEmbeddedAppParser();
    const ctx = createParserContext();

    expect(parser.parse(container, ctx)).toEqual({
      fields: [expect.objectContaining({ label: 'Стоимость', value: '900' })],
      skipChildren: true,
    });
  });
}

function runSkipChildrenNoopTest() {
  it('returns skipChildren without fields when extraction produces no values', () => {
    const container = document.createElement('div');
    container.setAttribute('data-virtual-iframe', 'true');
    container.setAttribute('data-application-code', 'dynamicFields');
    container.id = 'virtual-dynamic-fields-empty';
    document.body.append(container);

    expect(parseDynamicFieldsEmbeddedAppElement(container, createParserContext())).toEqual({
      skipChildren: true,
    });
  });
}

function runNonIframeFallbackTest() {
  it('falls back to virtual extraction when the matching DOM id is not an iframe', () => {
    const container = createDynamicFieldsContainer('910');
    const originalElement = document.createElement('div');
    originalElement.id = 'virtual-dynamic-fields';
    document.body.append(originalElement);
    const ctx = createParserContext();

    expect(parseDynamicFieldsEmbeddedAppElement(container, ctx)).toEqual({
      fields: [expect.objectContaining({ label: 'Стоимость', value: '910' })],
      skipChildren: true,
    });
  });
}

function runCanParseMatrixTest() {
  it('matches only dynamic virtual iframe containers', () => {
    const parser = new DynamicFieldsEmbeddedAppParser();
    const matching = document.createElement('div');
    matching.setAttribute('data-virtual-iframe', 'true');
    matching.setAttribute('data-application-code', 'dynamicFields');

    const wrongCode = document.createElement('div');
    wrongCode.setAttribute('data-virtual-iframe', 'true');
    wrongCode.setAttribute('data-application-code', 'mvs');

    const notVirtual = document.createElement('div');
    notVirtual.setAttribute('data-application-code', 'dynamicFields');

    expect(parser.canParse(matching, createParserContext())).toBe(true);
    expect(parser.canParse(wrongCode, createParserContext())).toBe(false);
    expect(parser.canParse(notVirtual, createParserContext())).toBe(false);
  });
}

describe('dynamic-fields embedded app section append', () => {
  runSectionAppendTest();
  runParserDelegationTest();
  runSkipChildrenNoopTest();
  runNonIframeFallbackTest();
  runCanParseMatrixTest();
});
