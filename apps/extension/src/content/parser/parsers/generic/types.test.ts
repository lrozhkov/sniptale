import { expectTypeOf, it } from 'vitest';
import type { DocumentBlock, SectionNode } from '@sniptale/runtime-contracts/dom-tree';
import type { GenericContentExtraction } from './types';

it('keeps generic extraction output aligned with the parsed document contract', () => {
  expectTypeOf<GenericContentExtraction['blocks']>().toEqualTypeOf<DocumentBlock[]>();
  expectTypeOf<GenericContentExtraction['sections']>().toEqualTypeOf<SectionNode[]>();
  expectTypeOf<GenericContentExtraction['replaceStructure']>().toEqualTypeOf<boolean | undefined>();
});
