import { translate } from '../../../../../platform/i18n';
import type { EditorDocumentActionContentBuilders } from '../commands.types';
import type { BuildEditorDocumentActionGroupsParams } from '../types';
import { buildImageFormatContent } from './image-format';
import { buildSaveToFolderContent } from './save-to-folder';

export function buildDocumentActionContentBuilders(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionContentBuilders {
  return {
    imageFormat: buildImageFormatContent(params, translate),
    saveToFolder: buildSaveToFolderContent(params, translate),
  };
}
