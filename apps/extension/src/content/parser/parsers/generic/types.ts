import type { DocumentBlock, SectionNode } from '@sniptale/runtime-contracts/dom-tree';

export type GenericContentExtraction = {
  sections: SectionNode[];
  blocks: DocumentBlock[];
  replaceStructure?: boolean;
};
