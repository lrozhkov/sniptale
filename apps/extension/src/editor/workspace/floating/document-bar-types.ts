import type { useEditorInspectorSidebarController } from '../../inspector/sidebar-controller';
import type { EditorToolbarContentProps } from '../toolbar/types';

export type EditorFloatingDocumentController = ReturnType<
  typeof useEditorInspectorSidebarController
>;

export type EditorFloatingDocumentBarProps = Pick<
  EditorToolbarContentProps,
  'hasImage' | 'history' | 'onBeforeSelectionAwareAction'
> & {
  documentController: EditorFloatingDocumentController;
};
