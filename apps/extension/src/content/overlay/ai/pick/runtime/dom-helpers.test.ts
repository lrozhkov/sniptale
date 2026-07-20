// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiPickElementIndex, resetAiPickElementIndex } from './dom-index';
import {
  appendAttributeFallbackField,
  buildComplexTree,
  buildTree,
  createIframeTarget,
  createMappingFallbackScenario,
  expectMappingFallbackCounts,
  expectMappingFallbackTargets,
} from './dom-helpers.test-support';
import { buildElementMaps, getDataIdsForElement, getNearestDataElement } from './dom-helpers';

const elementIndex = createAiPickElementIndex();

function registerIframeBridgeTest(): void {
  it('bridges iframe targets back to mapped frame elements', () => {
    const { iframe, target } = createIframeTarget();
    iframe.dataset['sniptaleId'] = 'field-1';
    buildElementMaps(elementIndex, buildTree('field-1'));

    expect(getNearestDataElement(elementIndex, target)).toBe(iframe);
    expect(Array.from(getDataIdsForElement(elementIndex, target))).toContain('field-1');
  });
}

function registerMappingFallbackTests(): void {
  it('maps sections, fields, and tables through selector, id, attribute, and row fallbacks', () => {
    const { bodySection, nestedTarget, rowElement } = createMappingFallbackScenario();
    const complexTree = buildComplexTree();
    appendAttributeFallbackField(complexTree);

    const counts = buildElementMaps(elementIndex, complexTree);

    expectMappingFallbackCounts(elementIndex, counts);
    expect(getNearestDataElement(elementIndex, nestedTarget)).toBe(bodySection);
    expectMappingFallbackTargets({ bodySection, elementIndex, rowElement });
  });
}

function createPrimaryTargetPreferenceTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Wrapper preference',
    structure: [
      {
        children: [
          {
            id: 'field-target',
            label: 'Field target',
            selected: true,
            selector: '#field-target',
            type: 'field',
            value: 'Field text',
            valueType: 'link',
          },
        ],
        id: 'section-target',
        selected: true,
        targetRef: {
          anchorStrategy: 'selector-chain',
          editable: false,
          realmId: 'realm-wrapper',
          selectors: ['#section-target'],
        },
        title: 'Wrapper section',
        type: 'section',
      },
    ],
  };
}

function registerPrimaryTargetPreferenceTest(): void {
  it('prefers a single contained primary field over a grouped wrapper ancestor', () => {
    const section = document.createElement('section');
    section.id = 'section-target';
    const wrapper = document.createElement('div');
    wrapper.id = 'wrapper-target';
    const field = document.createElement('a');
    field.id = 'field-target';
    const inner = document.createElement('span');
    inner.textContent = 'Field text';

    field.append(inner);
    wrapper.append(field);
    section.append(wrapper);
    document.body.append(section);

    buildElementMaps(elementIndex, createPrimaryTargetPreferenceTree());

    expect(getNearestDataElement(elementIndex, wrapper)).toBe(field);
    expect(getNearestDataElement(elementIndex, inner)).toBe(field);
  });
}

function registerNullFallbackTests(): void {
  it('returns null and empty ids when the target is unmapped in the main document', () => {
    const orphan = document.createElement('div');
    const child = document.createElement('span');
    orphan.append(child);
    document.body.append(orphan);

    expect(getNearestDataElement(elementIndex, child)).toBeNull();
    expect(Array.from(getDataIdsForElement(elementIndex, child))).toEqual([]);
  });
}

function registerBodyFallbackTests(): void {
  it('falls back to the mapped body when the closest mapped ancestor is the document body', () => {
    const child = document.createElement('div');
    child.id = 'body-child';
    document.body.append(child);

    const tree: ParsedDOMTree = {
      context: 'test',
      title: 'Body section',
      structure: [
        {
          children: [],
          id: 'body-section',
          selected: true,
          targetRef: {
            anchorStrategy: 'selector-chain',
            editable: false,
            realmId: 'realm-body',
            selectors: ['body'],
          },
          title: 'Body',
          type: 'section',
        },
      ],
    };

    buildElementMaps(elementIndex, tree);

    expect(getNearestDataElement(elementIndex, child)).toBe(document.body);
    expect(Array.from(getDataIdsForElement(elementIndex, child))).toEqual([]);
    expect(Array.from(getDataIdsForElement(elementIndex, document.body))).toContain('body-section');
  });
}

describe('ai-pick dom helpers', () => {
  afterEach(() => {
    resetAiPickElementIndex(elementIndex);
    document.body.replaceChildren();
  });

  registerIframeBridgeTest();
  registerMappingFallbackTests();
  registerPrimaryTargetPreferenceTest();
  registerNullFallbackTests();
  registerBodyFallbackTests();
});
