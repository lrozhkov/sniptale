import type { ParsedDocument } from '@sniptale/runtime-contracts/dom-tree';

export function createEmptyDocument(): ParsedDocument {
  return {
    context: 'test',
    structure: [],
    title: document.title || 'Page',
  };
}
