import { expectTypeOf, describe, it } from 'vitest';
import type {
  EditorDocumentActionCommand,
  EditorDocumentActionCommandBuilders,
  EditorDocumentActionCommands,
  EditorDocumentActionContentBuilders,
} from './commands';
import type { EditorDocumentActionCommand as EditorDocumentActionCommandRole } from './commands.types/command';
import type { EditorDocumentActionContent as EditorDocumentActionContentRole } from './commands.types/content';
import type {
  EditorDocumentActionCommandBuilders as EditorDocumentActionCommandBuildersRole,
  EditorDocumentActionCommands as EditorDocumentActionCommandsRole,
  EditorDocumentActionContentBuilders as EditorDocumentActionContentBuildersRole,
} from './commands.types/build';
import { buildDocumentActionCommandBuilders } from './commands';
import { buildDocumentActionContentBuilders } from './commands';
import { createDocumentActionParams } from './commands.test-support';

describe('editor-inspector-document-actions.model/commands.types', () => {
  it('keeps the extracted builder types aligned with the composed command contract', () => {
    const params = createDocumentActionParams();
    const commandBuilders = buildDocumentActionCommandBuilders(params, 'json-tag');
    const contentBuilders = buildDocumentActionContentBuilders(params);

    expectTypeOf<EditorDocumentActionCommand>().toEqualTypeOf<EditorDocumentActionCommandRole>();
    expectTypeOf<EditorDocumentActionCommandBuilders>().toEqualTypeOf<EditorDocumentActionCommandBuildersRole>();
    expectTypeOf<EditorDocumentActionCommands>().toEqualTypeOf<EditorDocumentActionCommandsRole>();
    expectTypeOf<EditorDocumentActionContentBuilders>().toEqualTypeOf<EditorDocumentActionContentBuildersRole>();
    expectTypeOf<EditorDocumentActionCommandRole['id']>().toEqualTypeOf<
      | 'close-file'
      | 'copy-png'
      | 'export-session'
      | 'import-session'
      | 'open-image'
      | 'save-image'
      | 'save-image-as'
    >();
    expectTypeOf<EditorDocumentActionContentRole['kind']>().toEqualTypeOf<'content'>();
    expectTypeOf<EditorDocumentActionContentRole['id']>().toEqualTypeOf<
      'image-format' | 'save-to-folder'
    >();
    expectTypeOf(commandBuilders).toMatchTypeOf<EditorDocumentActionCommandBuilders>();
    expectTypeOf(contentBuilders).toMatchTypeOf<EditorDocumentActionContentBuilders>();

    const commands: EditorDocumentActionCommands = {
      ...commandBuilders,
      ...contentBuilders,
    };

    expectTypeOf(commands).toMatchTypeOf<EditorDocumentActionCommands>();
  });
});
