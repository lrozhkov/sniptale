import type { BuildEditorDocumentActionGroupsParams } from './types';
export type {
  EditorDocumentActionCommand,
  EditorDocumentActionCommandBuilders,
  EditorDocumentActionCommands,
  EditorDocumentActionContentBuilders,
} from './commands.types';
export { buildDocumentActionCommandBuilders } from './commands.command-builders';
export { buildDocumentActionContentBuilders } from './commands.content-builders';
import type { EditorDocumentActionCommands } from './commands.types';
import { buildDocumentActionCommandBuilders } from './commands.command-builders';
import { buildDocumentActionContentBuilders } from './commands.content-builders';

export function buildDocumentActionCommands(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): EditorDocumentActionCommands {
  return {
    ...buildDocumentActionCommandBuilders(params, jsonTag),
    ...buildDocumentActionContentBuilders(params),
  };
}
