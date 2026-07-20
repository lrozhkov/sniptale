import { expectTypeOf, it } from 'vitest';

import type { AIEditChange, ParsedDOMTree, ParsedDocument, TableRowEdit } from '.';

it('keeps DOM tree aliases and edit discriminants precise', () => {
  expectTypeOf<ParsedDOMTree>().toEqualTypeOf<ParsedDocument>();
  expectTypeOf<Extract<AIEditChange, { type: 'field' }>>().toEqualTypeOf<{
    fieldId: string;
    fieldName: string;
    newValue: string;
    type: 'field';
  }>();
  expectTypeOf<Extract<AIEditChange, { type: 'tableRow' }>>().toEqualTypeOf<TableRowEdit>();
  expectTypeOf<Extract<AIEditChange, { type: 'unknown' }>>().toEqualTypeOf<never>();
});
