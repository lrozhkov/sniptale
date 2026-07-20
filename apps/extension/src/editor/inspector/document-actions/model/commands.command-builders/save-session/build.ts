import type { BuildEditorDocumentActionGroupsParams } from '../../types';
import type { EditorDocumentActionCommandBuilders } from '../../commands.types';

import { buildSaveImageCommandBuilders } from './image';
import { buildSessionCommandBuilders } from './session';

export function buildSaveSessionCommandBuilders(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): Pick<
  EditorDocumentActionCommandBuilders,
  'exportSession' | 'importSession' | 'saveImage' | 'saveImageAs'
> {
  return {
    ...buildSessionCommandBuilders(params, jsonTag),
    ...buildSaveImageCommandBuilders(params),
  };
}
