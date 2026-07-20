import { expectTypeOf, it } from 'vitest';

import type { EditorDocumentActionCommand } from './command';

it('keeps the command role exact', () => {
  expectTypeOf<EditorDocumentActionCommand['kind']>().toEqualTypeOf<'command'>();
  expectTypeOf<EditorDocumentActionCommand['id']>().toEqualTypeOf<
    | 'close-file'
    | 'copy-png'
    | 'export-session'
    | 'import-session'
    | 'open-image'
    | 'save-image'
    | 'save-image-as'
  >();
  expectTypeOf<EditorDocumentActionCommand['emphasis']>().toEqualTypeOf<
    'danger' | 'neutral' | 'primary' | 'secondary' | 'tertiary'
  >();
});
