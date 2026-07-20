import { FileJson2, FileOutput } from 'lucide-react';

import { translate } from '../../../../../../platform/i18n';
import type { BuildEditorDocumentActionGroupsParams } from '../../types';
import type { EditorDocumentActionCommandBuilders } from '../../commands.types';

function createExportSessionCommand(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): EditorDocumentActionCommandBuilders['exportSession'] {
  return {
    id: 'export-session',
    kind: 'command',
    label: translate('editor.documentActions.exportSession'),
    icon: FileOutput,
    emphasis: 'tertiary',
    meta: jsonTag,
    onClick: params.onExportSession,
  };
}

function createImportSessionCommand(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): EditorDocumentActionCommandBuilders['importSession'] {
  return {
    id: 'import-session',
    kind: 'command',
    label: translate('editor.documentActions.importSession'),
    icon: FileJson2,
    emphasis: 'tertiary',
    meta: jsonTag,
    onClick: params.onImportSession,
  };
}

export function buildSessionCommandBuilders(
  params: BuildEditorDocumentActionGroupsParams,
  jsonTag: string
): Pick<EditorDocumentActionCommandBuilders, 'exportSession' | 'importSession'> {
  return {
    exportSession: createExportSessionCommand(params, jsonTag),
    importSession: createImportSessionCommand(params, jsonTag),
  };
}
