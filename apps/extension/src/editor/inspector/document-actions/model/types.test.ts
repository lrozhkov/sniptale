import type { ReactNode } from 'react';
import { describe, expectTypeOf, it } from 'vitest';

import type {
  BuildEditorDocumentActionGroupsParams,
  EditorDocumentActionCommand,
  EditorDocumentActionCommandBuilders,
  EditorDocumentActionCommands,
  EditorDocumentActionContentBuilders,
  EditorDocumentActionGroup,
} from './types';
import { buildDocumentActionCommandBuilders, buildDocumentActionContentBuilders } from './commands';
import { createDocumentActionParams } from './commands.test-support';

describe('editor document action model types', () => {
  it('keeps the command and content roles exact', () => {
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
    expectTypeOf<EditorDocumentActionCommands['imageFormat']['kind']>().toEqualTypeOf<'content'>();
    expectTypeOf<EditorDocumentActionCommands['imageFormat']['id']>().toEqualTypeOf<
      'image-format' | 'save-to-folder'
    >();
    expectTypeOf<
      EditorDocumentActionCommands['imageFormat']['content']
    >().toEqualTypeOf<ReactNode>();
    expectTypeOf<EditorDocumentActionCommands['imageFormat']['value']>().toEqualTypeOf<
      string | null | undefined
    >();
  });

  it('keeps the composed builder contract exact', () => {
    expectTypeOf<EditorDocumentActionGroup['layout']>().toEqualTypeOf<'grid' | 'stack'>();
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
    expectTypeOf<BuildEditorDocumentActionGroupsParams['savePresets']>().toEqualTypeOf<
      BuildEditorDocumentActionGroupsParams['savePresets']
    >();

    const params = createDocumentActionParams();
    const commandBuilders = buildDocumentActionCommandBuilders(params, 'json-tag');
    const contentBuilders = buildDocumentActionContentBuilders(params);

    expectTypeOf(commandBuilders).toMatchTypeOf<EditorDocumentActionCommandBuilders>();
    expectTypeOf(contentBuilders).toMatchTypeOf<EditorDocumentActionContentBuilders>();

    const commands: EditorDocumentActionCommands = {
      ...commandBuilders,
      ...contentBuilders,
    };

    expectTypeOf(commands).toMatchTypeOf<EditorDocumentActionCommands>();
  });
});
