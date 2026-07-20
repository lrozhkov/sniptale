import { CopyPlus, Trash2 } from 'lucide-react';

import { EditorInspectorToolsPanel } from '../tools/panel';

import type { EditorInspectorToolsPanelProps } from '../tools/types';

type EditorInspectorContentToolsSectionsProps = Omit<
  EditorInspectorToolsPanelProps,
  'selectionDuplicateIcon' | 'selectionDeleteIcon'
>;

export function renderEditorInspectorContentToolsSections(
  props: EditorInspectorContentToolsSectionsProps
) {
  return (
    <EditorInspectorToolsPanel
      {...props}
      selectionDuplicateIcon={<CopyPlus size={15} strokeWidth={2} />}
      selectionDeleteIcon={<Trash2 size={15} strokeWidth={2} />}
    />
  );
}
