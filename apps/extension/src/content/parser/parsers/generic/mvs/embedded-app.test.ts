// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldNode } from '@sniptale/runtime-contracts/dom-tree';

const { extractMvsEmbeddedAppFieldsMock } = vi.hoisted(() => ({
  extractMvsEmbeddedAppFieldsMock: vi.fn<(container: HTMLElement, ctx: unknown) => FieldNode[]>(),
}));

vi.mock('./embedded-app.helpers', () => ({
  extractMvsEmbeddedAppFields: extractMvsEmbeddedAppFieldsMock,
}));

import {
  appendElement,
  buildContainer,
  createContext,
  createParserContainer,
  createSection,
} from './embedded-app.test.fixtures';
import { MvsEmbeddedAppParser, parseMvsEmbeddedAppElement } from './embedded-app';

beforeEach(() => {
  vi.clearAllMocks();
});

function registerCanParseTests() {
  it('accepts only MVS virtual iframes', () => {
    const parser = new MvsEmbeddedAppParser();
    const valid = createParserContainer();
    const wrongCode = createParserContainer();
    wrongCode.setAttribute('data-application-code', 'other');
    const notVirtual = createParserContainer();
    notVirtual.setAttribute('data-virtual-iframe', 'false');

    expect(parser.canParse(valid, createContext())).toBe(true);
    expect(parser.canParse(wrongCode, createContext())).toBe(false);
    expect(parser.canParse(notVirtual, createContext())).toBe(false);
  });
}

function registerAppendToCurrentSectionTest() {
  it('appends extracted fields into the current section when fields are returned', () => {
    const ctx = createContext();
    const section = createSection('Текущий раздел');
    ctx.currentSection = section;
    const container = createParserContainer();
    const fields = [
      {
        type: 'field' as const,
        id: 'field-1',
        label: 'Метка',
        value: 'Значение',
        valueType: 'string' as const,
        selector: 'div',
        selected: true,
        evidence: [],
      },
    ];
    extractMvsEmbeddedAppFieldsMock.mockReturnValue(fields);

    const result = parseMvsEmbeddedAppElement(container, ctx);

    expect(result).toEqual({ fields, skipChildren: true });
    expect(section.children).toEqual(fields);
  });
}

function registerEmptyFieldsNoMutationTest() {
  it('keeps the current section unchanged when the helper returns no fields', () => {
    const ctx = createContext();
    const section = createSection('Текущий раздел');
    ctx.currentSection = section;
    const container = createParserContainer();
    extractMvsEmbeddedAppFieldsMock.mockReturnValue([]);

    const result = parseMvsEmbeddedAppElement(container, ctx);

    expect(result).toEqual({ fields: [], skipChildren: true });
    expect(section.children).toEqual([]);
  });
}

function registerNoCurrentSectionTest() {
  it('returns extracted fields without mutating sections when no current section exists', () => {
    const ctx = createContext();
    const container = createParserContainer();
    const fields = [
      {
        type: 'field' as const,
        id: 'field-2',
        label: 'Статус',
        value: 'Открыт',
        valueType: 'string' as const,
        selector: 'div',
        selected: true,
        evidence: [],
      },
    ];
    extractMvsEmbeddedAppFieldsMock.mockReturnValue(fields);

    const result = parseMvsEmbeddedAppElement(container, ctx);

    expect(result).toEqual({ fields, skipChildren: true });
    expect(ctx.result.structure).toEqual([]);
    expect(ctx.currentSection).toBeNull();
  });
}

function registerFixtureHelperCoverageTest() {
  it('buildContainer uses the default MVS app code and appendElement handles missing props', () => {
    const { container, iframe } = buildContainer('mvs-container');

    expect(iframe.id).toBe('mvs-container');
    expect(container.getAttribute('data-application-code')).toBe('mvs');
    expect(container.getAttribute('data-virtual-iframe')).toBe('true');

    const doc = document.implementation.createHTMLDocument('fixture');
    const parent = doc.createElement('div');
    const child = appendElement(doc, parent, 'span');

    expect(child.tagName.toLowerCase()).toBe('span');
    expect(parent.children).toHaveLength(1);
  });
}

describe('mvs embedded app parser', () => {
  registerCanParseTests();
  registerAppendToCurrentSectionTest();
  registerEmptyFieldsNoMutationTest();
  registerNoCurrentSectionTest();
  registerFixtureHelperCoverageTest();
});
