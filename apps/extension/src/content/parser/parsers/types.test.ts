// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { DOMParser, ParserRegistry, type TraversalContext } from './types';

class TestParser extends DOMParser {
  constructor(
    public name: string,
    public priority: number,
    private readonly matches: boolean
  ) {
    super();
  }

  canParse() {
    return this.matches;
  }

  parse() {
    return { skipChildren: true };
  }
}

function createContext(): TraversalContext {
  return {
    currentSection: null,
    globalFieldIndex: 0,
    globalTableIndex: 0,
    processedAttrLists: new Set(),
    processedCommentContainers: new Set(),
    processedComments: new Set(),
    processedFieldElements: new Set(),
    processedTables: new Set(),
    result: { context: '', structure: [], title: '' },
    sectionElements: [],
    sectionIndex: 0,
  };
}

describe('ParserRegistry', () => {
  it('prefers the highest-priority matching parser and returns a defensive list copy', () => {
    const registry = new ParserRegistry();
    const low = new TestParser('low', 1, true);
    const high = new TestParser('high', 10, true);
    registry.register(low);
    registry.register(high);

    expect(registry.findParser(document.body, createContext())).toBe(high);
    expect(registry.getParsers()).toEqual([high, low]);
    expect(registry.getParsers()).not.toBe(registry.getParsers());
  });

  it('returns null when no parser accepts the element', () => {
    const registry = new ParserRegistry();
    registry.register(new TestParser('none', 1, false));

    expect(registry.findParser(document.body, createContext())).toBeNull();
  });
});
