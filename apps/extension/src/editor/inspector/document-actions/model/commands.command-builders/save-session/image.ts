import { Download, Save } from 'lucide-react';

import { translate } from '../../../../../../platform/i18n';
import type { BuildEditorDocumentActionGroupsParams } from '../../types';
import type { EditorDocumentActionCommandBuilders } from '../../commands.types';

function createSaveImageCommand(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionCommandBuilders['saveImage'] {
  return {
    id: 'save-image',
    kind: 'command',
    label: translate('editor.documentActions.download'),
    icon: Download,
    emphasis: 'primary',
    onClick: params.onSaveImage,
  };
}

function createSaveImageAsCommand(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionCommandBuilders['saveImageAs'] {
  return {
    id: 'save-image-as',
    kind: 'command',
    label: translate('editor.documentActions.downloadAs'),
    icon: Save,
    emphasis: 'secondary',
    onClick: params.onSaveImageAs,
  };
}

export function buildSaveImageCommandBuilders(
  params: BuildEditorDocumentActionGroupsParams
): Pick<EditorDocumentActionCommandBuilders, 'saveImage' | 'saveImageAs'> {
  return {
    saveImage: createSaveImageCommand(params),
    saveImageAs: createSaveImageAsCommand(params),
  };
}
