import { expectTypeOf, it } from 'vitest';

import type {
  BuildEditorDocumentActionGroupsParams,
  EditorDocumentActionCommand,
  EditorDocumentActionGroup,
} from './types';

it('keeps the document actions model types stable', () => {
  expectTypeOf<EditorDocumentActionGroup['layout']>().toEqualTypeOf<'grid' | 'stack'>();
  expectTypeOf<EditorDocumentActionCommand['kind']>().toEqualTypeOf<'command'>();
  expectTypeOf<BuildEditorDocumentActionGroupsParams['savePresets']>().toEqualTypeOf<
    BuildEditorDocumentActionGroupsParams['savePresets']
  >();
});
