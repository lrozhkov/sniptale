import type { Translate } from '../../../../../platform/i18n';
import type { EditorDocumentActionContentBuilders } from '../commands.types';
import type { BuildEditorDocumentActionGroupsParams } from '../types';

export function buildImageFormatContent(
  params: BuildEditorDocumentActionGroupsParams,
  translate: Translate
): EditorDocumentActionContentBuilders['imageFormat'] {
  return {
    id: 'image-format',
    kind: 'content',
    label: translate('imageSettings.section.formatLabel'),
    content: params.renderImageFormat(),
    note: translate('editor.compact.exportSettingsNote'),
  };
}
