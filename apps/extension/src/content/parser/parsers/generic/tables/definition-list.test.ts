// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import { DefinitionListParser } from './definition-list';

function createContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 1,
    globalTableIndex: 1,
    pendingFields: new Map<string, never[]>(),
    processedAttrLists: new Set<HTMLTableElement>(),
    processedCommentContainers: new Set<HTMLElement>(),
    processedComments: new Set<HTMLElement>(),
    processedFieldElements: new Set<HTMLElement>(),
    processedTables: new Set<HTMLTableElement>(),
    result: {
      context: 'test',
      title: 'Definition list',
      structure: [],
      meta: {
        profile: {
          vendor: 'generic',
          appFamily: 'generic-web',
          pageKind: 'content',
          pipelineId: 'generic-structured',
          confidence: 0.8,
          matchedSignals: [],
          preferredRoots: ['body'],
        },
        title: 'Definition list',
        url: 'https://example.test/reference',
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
    getOriginalElementFn: (node) => node,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

function registerCanParseTests() {
  it('parses only definition lists with dt/dd pairs', () => {
    const parser = new DefinitionListParser();
    const list = document.createElement('dl');
    list.append(document.createElement('dt'), document.createElement('dd'));
    const incomplete = document.createElement('dl');
    incomplete.append(document.createElement('dt'));

    expect(parser.canParse(list, createContext())).toBe(true);
    expect(parser.canParse(incomplete, createContext())).toBe(false);
    expect(parser.canParse(document.createElement('div'), createContext())).toBe(false);
  });
}

function registerParseFieldsTest() {
  it('creates an orphan attributes section and parses text and link values', () => {
    const parser = new DefinitionListParser();
    const ctx = createContext();
    const list = document.createElement('dl');

    const labelStatus = document.createElement('dt');
    labelStatus.textContent = 'Status:';
    const valueStatus = document.createElement('dd');
    valueStatus.textContent = 'Open';

    const labelOwner = document.createElement('dt');
    labelOwner.textContent = 'Owner';
    const valueOwner = document.createElement('dd');
    const link = document.createElement('a');
    link.href = 'https://example.test/owner';
    link.textContent = 'Operations';
    valueOwner.append(link);

    const labelDuplicate = document.createElement('dt');
    labelDuplicate.textContent = 'Mirror';
    const valueDuplicate = document.createElement('dd');
    valueDuplicate.textContent = 'Mirror';

    list.append(labelStatus, valueStatus, labelOwner, valueOwner, labelDuplicate, valueDuplicate);

    const result = parser.parse(list, ctx);

    expect(result.fields).toHaveLength(2);
    expect(ctx.currentSection?.title).toBe('Атрибуты');
    expect(ctx.currentSection?.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Status',
          value: 'Open',
          valueType: 'string',
        }),
        expect.objectContaining({
          label: 'Owner',
          value: 'Operations',
          valueType: 'link',
          linkRef: 'https://example.test/owner',
        }),
      ])
    );
  });
}

function registerEmptyResultTest() {
  it('returns an empty result when no valid dt/dd field pairs survive filtering', () => {
    const parser = new DefinitionListParser();
    const ctx = createContext();
    const list = document.createElement('dl');

    const label = document.createElement('dt');
    label.textContent = 'Mirror';
    const value = document.createElement('dd');
    value.textContent = 'Mirror';
    list.append(label, value);

    expect(parser.parse(list, ctx)).toEqual({});
  });
}

function registerExistingSectionResidualTests() {
  it('reuses an existing section and skips dangling dt entries without dd pairs', () => {
    const parser = new DefinitionListParser();
    const ctx = createContext();
    const existingSection = {
      type: 'section' as const,
      id: 'section-existing',
      title: 'Existing attributes',
      children: [],
      selected: true,
    };
    ctx.currentSection = existingSection;
    ctx.result.structure.push(existingSection);

    const list = document.createElement('dl');
    const label = document.createElement('dt');
    label.textContent = 'Status';
    const value = document.createElement('dd');
    value.textContent = 'Open';
    const dangling = document.createElement('dt');
    dangling.textContent = 'Owner';
    list.append(label, value, dangling);

    const result = parser.parse(list, ctx);

    expect(result.fields).toHaveLength(1);
    expect(ctx.result.structure).toHaveLength(1);
    expect(ctx.currentSection?.title).toBe('Existing attributes');
  });
}

function registerMissingLabelOrValueTests() {
  it('drops dt/dd pairs when the label or extracted value is empty', () => {
    const parser = new DefinitionListParser();
    const ctx = createContext();
    const list = document.createElement('dl');

    const emptyLabel = document.createElement('dt');
    emptyLabel.textContent = '';
    const emptyLabelValue = document.createElement('dd');
    emptyLabelValue.textContent = 'Open';

    const emptyValueLabel = document.createElement('dt');
    emptyValueLabel.textContent = 'Owner';
    const emptyValue = document.createElement('dd');
    const link = document.createElement('a');
    link.href = 'https://example.test/owner';
    emptyValue.append(link);

    list.append(emptyLabel, emptyLabelValue, emptyValueLabel, emptyValue);

    expect(parser.parse(list, ctx)).toEqual({});
  });
}

describe('DefinitionListParser', () => {
  registerCanParseTests();
  registerParseFieldsTest();
  registerEmptyResultTest();
  registerExistingSectionResidualTests();
  registerMissingLabelOrValueTests();
});
