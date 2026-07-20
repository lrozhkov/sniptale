// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { createAiPickElementIndex, resetAiPickElementIndex } from './dom-index';
import { buildElementMaps, getDataIdsForElement, getNearestDataElement } from './dom-helpers';
import {
  createNaumenMvsContainer,
  setupCardPageContext,
  silenceParserConsole,
} from '../../../../../../../../tooling/test/support/content/dom-tree-parser/mvs/test-helpers';
import { parseDOMTreeAfterIframePreflight } from '../../../../parser/dom-tree-parser/snapshot';

const elementIndex = createAiPickElementIndex();

describe('ai-pick MVS dom helpers', () => {
  afterEach(() => {
    resetAiPickElementIndex(elementIndex);
    document.body.replaceChildren();
  });

  it('prefers the MVS card container so AI-pick collects every field in the block', async () => {
    silenceParserConsole();
    setupCardPageContext();
    const { cardBlock, cardValue } = createNaumenMvsContainer();
    const tree = await parseDOMTreeAfterIframePreflight('mvs-ai-pick-test');

    buildElementMaps(elementIndex, tree);

    expect(getNearestDataElement(elementIndex, cardValue)).toBe(cardBlock);
    expect(Array.from(getDataIdsForElement(elementIndex, cardValue))).toEqual(
      expect.arrayContaining([expect.stringContaining('field-')])
    );
    expect(getDataIdsForElement(elementIndex, cardValue).size).toBeGreaterThan(1);
  });
});
