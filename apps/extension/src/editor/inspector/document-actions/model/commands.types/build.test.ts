import { expectTypeOf, it } from 'vitest';

import type {
  EditorDocumentActionCommandBuilders,
  EditorDocumentActionCommands,
  EditorDocumentActionContentBuilders,
} from './build';
import type { EditorDocumentActionCommand } from './command';
import type { EditorDocumentActionContent } from './content';

it('keeps the composed command contract exact', () => {
  expectTypeOf<
    EditorDocumentActionCommands['closeFile']
  >().toEqualTypeOf<EditorDocumentActionCommand>();
  expectTypeOf<
    EditorDocumentActionCommands['imageFormat']
  >().toEqualTypeOf<EditorDocumentActionContent>();
  expectTypeOf<keyof EditorDocumentActionCommandBuilders>().toEqualTypeOf<
    | 'closeFile'
    | 'copyPng'
    | 'exportSession'
    | 'importSession'
    | 'openImage'
    | 'saveImage'
    | 'saveImageAs'
  >();
  expectTypeOf<keyof EditorDocumentActionContentBuilders>().toEqualTypeOf<
    'imageFormat' | 'saveToFolder'
  >();
});
