// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';

import type { PageProfile } from '@sniptale/runtime-contracts/dom-tree';
import { setSniptaleId } from '../../dom-utils/dom-helpers';
import type { TraversalContext } from '../../parsers';
import { DOMParser, ParserRegistry } from '../../parsers/types';
import type { DomTreeParserBackendInput } from '../contracts';
import { legacyTreeWalkerBackend } from '.';

const pageProfile: PageProfile = {
  vendor: 'generic',
  appFamily: 'generic-web',
  pageKind: 'content',
  pipelineId: 'generic-structured',
  confidence: 0.8,
  matchedSignals: [],
  preferredRoots: ['article', 'body'],
};

const pageMetadata = {
  pageHostname: 'snapshot.example',
  pageTitle: 'Snapshot title',
  pageUrl: 'https://snapshot.example/incident/42',
};

class TrackingParser extends DOMParser {
  name = 'TrackingParser';
  priority = 100;

  canParse(): boolean {
    return true;
  }

  parse(element: HTMLElement, ctx: TraversalContext) {
    ctx.result.meta?.warnings.push(element.id || element.tagName.toLowerCase());
    return { skipChildren: element.hasAttribute('data-skip-children') };
  }
}

function parseWithBackend(
  parseRoot: HTMLElement,
  overrides: Partial<DomTreeParserBackendInput> = {}
) {
  const registry = new ParserRegistry();
  registry.register(new TrackingParser());

  return legacyTreeWalkerBackend.parse({
    pageMetadata,
    pageProfile,
    parseRoot,
    pipeline: {
      registry,
      trace: {
        parserNames: ['TrackingParser'],
        registryId: 'test-registry',
        rootStrategy: 'live-root',
      },
    },
    ...overrides,
  });
}

afterEach(() => {
  document.body.replaceChildren();
  document.title = '';
  window.history.replaceState({}, '', '/');
});

function registerExplicitInputTest(): void {
  it('uses only the supplied root, profile, pipeline, and page metadata', () => {
    document.title = 'Live title';
    const outside = document.createElement('div');
    outside.id = 'outside-root';
    const parseRoot = document.createElement('section');
    const child = document.createElement('div');
    child.id = 'inside-root';
    parseRoot.append(child);
    document.body.append(outside, parseRoot);

    const tree = parseWithBackend(parseRoot);

    expect(tree.meta?.pipelineTrace?.registryId).toBe('test-registry');
    expect(tree.meta?.profile).toBe(pageProfile);
    expect(tree.meta?.warnings).toContain('inside-root');
    expect(tree.meta?.warnings).not.toContain('outside-root');
    expect(tree.context).toBe('Карточка инцидента');
    expect(tree.title).toBe('Snapshot title');
    expect(tree.meta?.url).toBe(pageMetadata.pageUrl);
  });
}

function registerSkippedSiblingTest(): void {
  it('skips a subtree but continues with its next sibling', () => {
    const parseRoot = document.createElement('section');
    const skipped = document.createElement('div');
    skipped.id = 'skipped-root';
    skipped.dataset['skipChildren'] = 'true';
    const skippedChild = document.createElement('span');
    skippedChild.id = 'skipped-child';
    skipped.append(skippedChild);
    const sibling = document.createElement('div');
    sibling.id = 'sibling';
    parseRoot.append(skipped, sibling);

    const tree = parseWithBackend(parseRoot);

    expect(tree.meta?.warnings).toEqual(expect.arrayContaining(['skipped-root', 'sibling']));
    expect(tree.meta?.warnings).not.toContain('skipped-child');
  });
}

function registerSkippedParentContinuationTest(): void {
  it('walks up to continue after a skipped last child', () => {
    const parseRoot = document.createElement('section');
    const wrapper = document.createElement('div');
    const skipped = document.createElement('div');
    skipped.id = 'nested-skipped-root';
    skipped.dataset['skipChildren'] = 'true';
    const skippedChild = document.createElement('span');
    skippedChild.id = 'nested-skipped-child';
    skipped.append(skippedChild);
    wrapper.append(skipped);
    const sibling = document.createElement('div');
    sibling.id = 'sibling-after-wrapper';
    parseRoot.append(wrapper, sibling);

    const tree = parseWithBackend(parseRoot);

    expect(tree.meta?.warnings).toEqual(
      expect.arrayContaining(['nested-skipped-root', 'sibling-after-wrapper'])
    );
    expect(tree.meta?.warnings).not.toContain('nested-skipped-child');
  });
}

function registerResolverLifecycleTest(): void {
  it('clears the scoped original-element resolver after parsing', () => {
    const original = document.createElement('div');
    const virtual = document.createElement('div');

    parseWithBackend(virtual, { resolveOriginalElement: () => original });

    const laterElement = document.createElement('div');
    setSniptaleId(laterElement, 'field-42');
    expect(original.dataset['sniptaleId']).toBeUndefined();
    expect(laterElement.dataset['sniptaleId']).toBe('field-42');
  });
}

describe('legacyTreeWalkerBackend', () => {
  registerExplicitInputTest();
  registerSkippedSiblingTest();
  registerSkippedParentContinuationTest();
  registerResolverLifecycleTest();
});
