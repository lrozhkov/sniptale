import type { BuildEditorDocumentActionGroupsParams } from '../types';
import type { EditorDocumentActionCommandBuilders } from '../types';
import { buildCopyOpenCloseCommandBuilders } from './copy-open-close';
import { buildSaveSessionCommandBuilders } from './save-session';

export function buildDocumentActionCommandBuilders(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): EditorDocumentActionCommandBuilders {
  return {
    ...buildCopyOpenCloseCommandBuilders(params),
    ...buildSaveSessionCommandBuilders(params, jsonTag),
  };
}
