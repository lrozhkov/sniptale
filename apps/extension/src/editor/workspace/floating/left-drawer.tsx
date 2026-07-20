import { X } from 'lucide-react';
import type { EditorSelectionState } from '../../../features/editor/document/types';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { getToolLabel } from '../../chrome/tool-icons';
import { EditorInspectorContent } from '../../inspector/content';
import { createEditorInspectorContentPanelProps } from '../../inspector/sidebar-expanded-content/helpers';
import { EditorIconButton } from '../../chrome/ui';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import type { EditorFloatingLeftDrawerMode } from './routes';

const LEFT_DRAWER_CLASS_NAME = floatingChromeClassNames(
  'absolute left-3 top-[4.25rem] bottom-3 z-40 flex min-h-0 flex-col overflow-hidden',
  'w-[22rem] max-w-[calc(100vw-1.5rem)]',
  'max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto max-[720px]:bottom-[22rem]',
  'max-[720px]:max-h-[min(70vh,calc(100vh-32.5rem))] max-[720px]:w-auto'
);

const LEFT_DRAWER_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center gap-3 border-b px-4 py-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

const LEFT_DRAWER_HEADER_TITLE_CLASS_NAME =
  'truncate text-[12px] font-bold uppercase leading-4 text-[color:var(--sniptale-color-text-secondary)]';

const LEFT_DRAWER_SCROLL_CLASS_NAME =
  'min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable_both-edges]';

const LEFT_DRAWER_TOOL_SELECTION: EditorSelectionState = {
  hasSelection: false,
  selectedObjectCount: 0,
  selectedObjectHeight: null,
  selectedObjectId: null,
  selectedObjectIds: [],
  selectedObjectType: null,
  selectedObjectWidth: null,
};

function createLeftDrawerContentProps(
  contentProps: ReturnType<typeof createEditorInspectorContentPanelProps>
) {
  return {
    ...contentProps,
    canDeleteSelection: false,
    isResizableLayerSelection: false,
    richShapeSelection: null,
    selection: LEFT_DRAWER_TOOL_SELECTION,
  };
}

export function EditorFloatingLeftDrawer({
  documentController,
  hasImage,
  mode,
  onClose,
}: Pick<EditorToolbarContentProps, 'hasImage'> & {
  documentController: EditorFloatingDocumentController;
  mode: EditorFloatingLeftDrawerMode;
  onClose: () => void;
}) {
  const contentProps = createEditorInspectorContentPanelProps(hasImage, documentController);
  const drawerContentProps = createLeftDrawerContentProps(contentProps);

  return (
    <FloatingChromePanel
      dataUi={`editor.floating.left-drawer.${mode}`}
      className={LEFT_DRAWER_CLASS_NAME}
    >
      <div className={LEFT_DRAWER_HEADER_CLASS_NAME}>
        <div className="min-w-0 flex-1">
          <div className={LEFT_DRAWER_HEADER_TITLE_CLASS_NAME}>{getToolLabel(mode)}</div>
        </div>
        <EditorIconButton
          title={translate('common.actions.close')}
          onClick={onClose}
          data-ui="editor.floating.left-drawer.close-button"
        >
          <X size={16} strokeWidth={2} />
        </EditorIconButton>
      </div>
      <div className={LEFT_DRAWER_SCROLL_CLASS_NAME}>
        <EditorInspectorContent
          {...drawerContentProps}
          inspector="tool"
          highlightedTool={mode}
          showDocumentActions={false}
          confirmDialog={null}
        />
      </div>
    </FloatingChromePanel>
  );
}
