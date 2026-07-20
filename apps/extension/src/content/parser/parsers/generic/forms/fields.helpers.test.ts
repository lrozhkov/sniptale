// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { TraversalContext } from '../../types';
import {
  buildFieldNode,
  isForeignVirtualIframeDescendant,
  shouldSkipFormFieldsContainerWithContext,
} from './fields.helpers';

function createContext(pageUrl: string): TraversalContext {
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
      title: 'Form page',
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
        title: 'Form page',
        url: pageUrl,
        warnings: [],
      },
    },
    sectionElements: [],
    sectionIndex: 1,
  };
}

function registerForeignIframeTests() {
  it('detects only foreign virtual iframe descendants', () => {
    const container = document.createElement('div');
    container.setAttribute('data-virtual-iframe', 'true');
    const sameIframeChild = document.createElement('div');
    container.append(sameIframeChild);

    const foreignIframe = document.createElement('div');
    foreignIframe.setAttribute('data-virtual-iframe', 'true');
    const foreignChild = document.createElement('div');
    foreignIframe.append(foreignChild);
    document.body.append(container, foreignIframe);

    expect(isForeignVirtualIframeDescendant(container, sameIframeChild)).toBe(false);
    expect(isForeignVirtualIframeDescendant(container, foreignChild)).toBe(true);
  });
}

function createPortalSearchBlock() {
  const mainRoot = document.createElement('div');
  mainRoot.className = 'Main__root';
  const searchBlock = document.createElement('div');
  searchBlock.className = 'SearchBlock__root';
  mainRoot.append(searchBlock);

  return searchBlock;
}

function registerPortalSearchBlockSkipTests() {
  it('skips portal homepage containers by canonical page metadata', () => {
    window.history.replaceState({}, '', '/not-portal/');

    const searchBlock = createPortalSearchBlock();

    expect(
      shouldSkipFormFieldsContainerWithContext(
        searchBlock,
        createContext('https://example.test/portal/')
      )
    ).toBe(true);
  });

  it('does not skip the same container when canonical metadata is not portal homepage', () => {
    const searchBlock = createPortalSearchBlock();

    expect(
      shouldSkipFormFieldsContainerWithContext(
        searchBlock,
        createContext('https://example.test/dashboard/')
      )
    ).toBe(false);
  });
}

function registerPortalDescendantSkipTests() {
  it('skips nested portal descendants through the closest-root fallback', () => {
    const mainRoot = document.createElement('div');
    mainRoot.className = 'Main__root';
    const footer = document.createElement('div');
    footer.className = 'Footer__footerBlock';
    const nestedCard = document.createElement('div');
    footer.append(nestedCard);
    mainRoot.append(footer);

    expect(
      shouldSkipFormFieldsContainerWithContext(
        nestedCard,
        createContext('https://example.test/portal/')
      )
    ).toBe(true);
  });

  it('does not treat portal-shaped containers as skippable when context is absent', () => {
    const footer = document.createElement('div');
    footer.className = 'Footer__footerBlock';

    expect(shouldSkipFormFieldsContainerWithContext(footer)).toBe(false);
  });
}

function registerSensitiveEvidenceTests() {
  it('redacts sensitive field values before storing parser evidence', () => {
    const input = document.createElement('input');
    input.value = 'visible-secret';
    document.body.append(input);

    const field = buildFieldNode({
      ctx: createContext('https://example.test/form/'),
      label: 'Password',
      sourceElement: input,
      value: input.value,
      valueType: 'string',
    });

    expect(field.value).not.toContain('visible-secret');
    expect(JSON.stringify(field.evidence)).not.toContain('visible-secret');
  });
}

describe('form-fields helpers', () => {
  registerForeignIframeTests();
  registerPortalSearchBlockSkipTests();
  registerPortalDescendantSkipTests();
  registerSensitiveEvidenceTests();
});
