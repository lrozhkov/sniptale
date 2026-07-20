import { expectTypeOf, it } from 'vitest';
import type { ReactNode } from 'react';

import type { EditorDocumentActionContent } from './content';

it('keeps the content role exact', () => {
  expectTypeOf<EditorDocumentActionContent['kind']>().toEqualTypeOf<'content'>();
  expectTypeOf<EditorDocumentActionContent['id']>().toEqualTypeOf<
    'image-format' | 'save-to-folder'
  >();
  expectTypeOf<EditorDocumentActionContent['content']>().toEqualTypeOf<ReactNode>();
  expectTypeOf<EditorDocumentActionContent['value']>().toEqualTypeOf<string | null | undefined>();
});
