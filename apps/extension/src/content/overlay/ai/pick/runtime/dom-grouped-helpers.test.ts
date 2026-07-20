// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';
import { createAiPickElementIndex, resetAiPickElementIndex } from './dom-index';
import { buildElementMaps, getNearestDataElement } from './dom-helpers';

const elementIndex = createAiPickElementIndex();

function buildGroupedWrapperTree(): ParsedDOMTree {
  return {
    context: 'test',
    title: 'Grouped wrapper preference',
    structure: [
      {
        children: [
          {
            id: 'field-target-1',
            label: 'Field target 1',
            selected: true,
            selector: '#field-target-1',
            type: 'field',
            value: 'Field 1',
            valueType: 'link',
          },
          {
            id: 'field-target-2',
            label: 'Field target 2',
            selected: true,
            selector: '#field-target-2',
            type: 'field',
            value: 'Field 2',
            valueType: 'link',
          },
        ],
        id: 'section-target',
        selected: true,
        targetRef: {
          anchorStrategy: 'selector-chain',
          editable: false,
          realmId: 'realm-grouped-wrapper',
          selectors: ['#section-target'],
        },
        title: 'Wrapper section',
        type: 'section',
      },
    ],
  };
}

function createGroupedWrapperFixture() {
  const section = document.createElement('section');
  section.id = 'section-target';
  const firstWrapper = document.createElement('div');
  const secondWrapper = document.createElement('div');
  const firstField = document.createElement('a');
  const secondField = document.createElement('a');
  const title = document.createElement('span');

  title.textContent = 'Общая информация';
  firstField.id = 'field-target-1';
  secondField.id = 'field-target-2';
  firstField.textContent = 'Field 1';
  secondField.textContent = 'Field 2';
  firstWrapper.append(firstField);
  secondWrapper.append(secondField);
  section.append(title, firstWrapper, secondWrapper);
  document.body.append(section);

  return { section, title };
}

describe('ai-pick grouped dom helpers', () => {
  afterEach(() => {
    resetAiPickElementIndex(elementIndex);
    document.body.replaceChildren();
  });

  it('keeps grouped wrappers selectable when they contain multiple primary targets', () => {
    const { section, title } = createGroupedWrapperFixture();

    buildElementMaps(elementIndex, buildGroupedWrapperTree());

    expect(getNearestDataElement(elementIndex, title)).toBe(section);
    expect(getNearestDataElement(elementIndex, section)).toBe(section);
  });
});
