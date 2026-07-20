import { ClipboardCopy, FilePlus2, X } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import type { BuildEditorDocumentActionGroupsParams } from '../types';
import type { EditorDocumentActionCommandBuilders } from '../commands.types';

function createCopyPngCommand(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionCommandBuilders['copyPng'] {
  return {
    id: 'copy-png',
    kind: 'command',
    label: translate('editor.documentActions.copyPng'),
    icon: ClipboardCopy,
    emphasis: 'secondary',
    disabled: Boolean(params.copyRenderedImageDisabledReason),
    onClick: params.onCopyRenderedImage,
    ...(params.copyRenderedImageDisabledReason == null
      ? {}
      : { disabledReason: params.copyRenderedImageDisabledReason }),
  };
}

function createCloseFileCommand(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionCommandBuilders['closeFile'] {
  return {
    id: 'close-file',
    kind: 'command',
    label: translate('editor.documentActions.closeFile'),
    icon: X,
    emphasis: 'neutral',
    onClick: params.onCloseDocument,
  };
}

function createOpenImageCommand(
  params: BuildEditorDocumentActionGroupsParams
): EditorDocumentActionCommandBuilders['openImage'] {
  return {
    id: 'open-image',
    kind: 'command',
    label: translate('editor.documentActions.openImage'),
    icon: FilePlus2,
    emphasis: 'neutral',
    onClick: params.onOpenImage,
  };
}

export function buildCopyOpenCloseCommandBuilders(
  params: BuildEditorDocumentActionGroupsParams
): Pick<EditorDocumentActionCommandBuilders, 'closeFile' | 'copyPng' | 'openImage'> {
  return {
    closeFile: createCloseFileCommand(params),
    copyPng: createCopyPngCommand(params),
    openImage: createOpenImageCommand(params),
  };
}
