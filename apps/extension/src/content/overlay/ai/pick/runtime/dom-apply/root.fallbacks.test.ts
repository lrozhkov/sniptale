// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { AIEditChange, ParsedDOMTree, TargetRef } from '@sniptale/runtime-contracts/dom-tree';
import { applyAIChanges } from '.';

afterEach(() => {
  document.body.replaceChildren();
});

function createTargetRef(overrides: Partial<TargetRef> = {}): TargetRef {
  return {
    realmId: 'main',
    selectors: [],
    anchorStrategy: 'sniptale',
    editable: true,
    ...overrides,
  };
}

function createFallbackField(
  id: string,
  label: string,
  value: string,
  extras: Record<string, unknown> = {}
) {
  return {
    type: 'field' as const,
    id,
    label,
    selected: false,
    value,
    valueType: 'string' as const,
    ...extras,
  };
}

function buildFallbackTree(): ParsedDOMTree {
  const children = [
    createFallbackField('field-sniptale-explicit', 'Explicit sniptale', 'old-1', {
      targetRef: createTargetRef({
        sniptaleId: 'field-target-sniptale',
      }),
    }),
    createFallbackField('field-selector-targetref', 'Selector targetRef', 'old-2', {
      targetRef: createTargetRef({
        selectors: ['[data-target="selector-hit"]'],
      }),
    }),
    createFallbackField('field-nodeid-sniptale', 'Node id sniptale', 'old-3', {
      targetRef: createTargetRef(),
    }),
    createFallbackField('field-legacy-selector', 'Legacy selector', 'old-4', {
      selector: '[data-legacy-selector="field"]',
    }),
    createFallbackField('field-legacy-id', 'Legacy id', 'old-5'),
    createFallbackField('field-legacy-attr', 'Legacy attr', 'old-6'),
  ];

  return {
    context: 'test',
    title: 'Fallback page',
    structure: [
      {
        type: 'section',
        id: 'section-fallbacks',
        title: 'Fallbacks',
        selected: false,
        children,
      },
    ],
  };
}

function appendFallbackFixture(id: string, text: string) {
  const element = document.createElement('div');
  element.dataset['testId'] = id;
  element.textContent = text;
  document.body.append(element);
  return element;
}

function appendFallbackFixtures() {
  const sniptale = appendFallbackFixture('explicit-sniptale', 'old-1');
  sniptale.dataset['sniptaleId'] = 'field-target-sniptale';

  const selectorTarget = appendFallbackFixture('selector-targetref', 'old-2');
  selectorTarget.setAttribute('data-target', 'selector-hit');

  const nodeIdSniptale = appendFallbackFixture('nodeid-sniptale', 'old-3');
  nodeIdSniptale.dataset['sniptaleId'] = 'field-nodeid-sniptale';

  const legacySelector = appendFallbackFixture('legacy-selector', 'old-4');
  legacySelector.setAttribute('data-legacy-selector', 'field');

  const legacyId = appendFallbackFixture('legacy-id', 'old-5');
  legacyId.id = 'field-legacy-id';

  const legacyAttr = appendFallbackFixture('legacy-attr', 'old-6');
  legacyAttr.dataset['sniptaleId'] = 'field-legacy-attr';

  return {
    legacyAttr,
    legacyId,
    legacySelector,
    nodeIdSniptale,
    selectorTarget,
    sniptale,
  };
}

function buildFallbackChanges(): AIEditChange[] {
  return [
    {
      type: 'field',
      fieldId: 'field-sniptale-explicit',
      fieldName: 'Explicit sniptale',
      newValue: 'new-1',
    },
    {
      type: 'field',
      fieldId: 'field-selector-targetref',
      fieldName: 'Selector targetRef',
      newValue: 'new-2',
    },
    {
      type: 'field',
      fieldId: 'field-nodeid-sniptale',
      fieldName: 'Node id sniptale',
      newValue: 'new-3',
    },
    {
      type: 'field',
      fieldId: 'field-legacy-selector',
      fieldName: 'Legacy selector',
      newValue: 'new-4',
    },
    { type: 'field', fieldId: 'field-legacy-id', fieldName: 'Legacy id', newValue: 'new-5' },
    { type: 'field', fieldId: 'field-legacy-attr', fieldName: 'Legacy attr', newValue: 'new-6' },
  ];
}

describe('applyAIChanges target fallbacks', () => {
  it('applies field edits through sniptale, selector, id, and legacy fallback paths', () => {
    const fixtures = appendFallbackFixtures();

    const result = applyAIChanges(buildFallbackTree(), buildFallbackChanges());

    expect(result).toEqual({ appliedCount: 6, notFoundCount: 0 });
    expect(fixtures.sniptale.textContent).toBe('new-1');
    expect(fixtures.selectorTarget.textContent).toBe('new-2');
    expect(fixtures.nodeIdSniptale.textContent).toBe('new-3');
    expect(fixtures.legacySelector.textContent).toBe('new-4');
    expect(fixtures.legacyId.textContent).toBe('new-5');
    expect(fixtures.legacyAttr.textContent).toBe('new-6');
  });
});
