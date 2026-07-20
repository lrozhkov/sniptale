import { describe, expect, it } from 'vitest';

import { resolveDomTreeParserBackend } from '.';

describe('resolveDomTreeParserBackend', () => {
  it('selects the legacy TreeWalker only through the parser-owned backend selector', () => {
    expect(resolveDomTreeParserBackend().id).toBe('legacy-tree-walker');
  });
});
