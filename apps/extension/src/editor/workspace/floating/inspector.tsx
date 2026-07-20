import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { ProductConfirmDialog } from '@sniptale/ui/product-feedback/confirm-dialog';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate, useAppLocale } from '../../../platform/i18n';
import { EditorInspectorCompactToolbar } from '../../inspector/compact';
import { EditorInspectorContent } from '../../inspector/content';
import { EditorInspectorLayersPanel } from '../../inspector/layers';
import { EditorInspectorSidebarHiddenInputs } from '../../inspector/sidebar/hidden-inputs';
import {
  createEditorInspectorContentPanelProps,
  createEditorInspectorLayersPanelProps,
} from '../../inspector/sidebar-expanded-content/helpers';
import { EditorIconButton } from '../../chrome/ui';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';

type EditorFloatingInspectorProps = Pick<
  EditorToolbarContentProps,
  'hasImage' | 'inspectorCollapsed' | 'inspectorMeta' | 'onCollapseInspector' | 'onExpandInspector'
> & {
  documentController: EditorFloatingDocumentController;
};

const INSPECTOR_PANEL_CLASS_NAME = floatingChromeClassNames(
  'absolute right-3 top-3 z-30 flex min-h-0 flex-col overflow-hidden',
  'bottom-[17.25rem] w-[min(21rem,calc(100vw-1.5rem))]',
  'max-[980px]:bottom-[15.25rem] max-[720px]:hidden'
);

const INSPECTOR_PANEL_COLLAPSED_CLASS_NAME = floatingChromeClassNames(
  'absolute right-3 top-3 z-30 flex min-h-0 w-14 flex-col overflow-hidden',
  'bottom-[17.25rem] max-[720px]:hidden'
);

const INSPECTOR_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center gap-3 border-b px-4 py-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

const INSPECTOR_COLLAPSED_HEADER_CLASS_NAME = [
  'flex shrink-0 justify-center border-b px-2 py-2',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

const INSPECTOR_SCROLL_CLASS_NAME =
  'min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable_both-edges]';

const LAYERS_PANEL_CLASS_NAME = floatingChromeClassNames(
  'absolute bottom-3 right-3 z-40 flex h-[15.5rem] min-h-14 flex-col',
  'w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden max-[720px]:hidden'
);

function resolveFloatingInspectorMeta(
  props: EditorFloatingInspectorProps,
  controller: EditorFloatingDocumentController
) {
  if (controller.inspector === 'file') {
    return {
      title: translate('editor.toolbar.inspectorFallback'),
      subtitle: translate('editor.compact.chooseToolOrObject'),
    };
  }

  return props.inspectorMeta;
}

function EditorFloatingInspectorHeader({
  inspectorCollapsed,
  inspectorMeta,
  onCollapseInspector,
  onExpandInspector,
}: Pick<
  EditorFloatingInspectorProps,
  'inspectorCollapsed' | 'onCollapseInspector' | 'onExpandInspector'
> & {
  inspectorMeta: EditorToolbarContentProps['inspectorMeta'];
}) {
  if (inspectorCollapsed) {
    return (
      <div className={INSPECTOR_COLLAPSED_HEADER_CLASS_NAME}>
        <EditorIconButton
          title={`${translate('editor.toolbar.expandInspectorPrefix')} ${inspectorMeta.title}`}
          onClick={onExpandInspector}
          data-ui="editor.floating.inspector-expand-button"
        >
          <PanelRightOpen size={16} strokeWidth={2} />
        </EditorIconButton>
      </div>
    );
  }

  return (
    <div className={INSPECTOR_HEADER_CLASS_NAME}>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold leading-snug text-[var(--sniptale-color-text-primary)]">
          {inspectorMeta.title}
        </div>
        <div className="truncate text-xs leading-snug text-[var(--sniptale-color-text-muted)]">
          {inspectorMeta.subtitle}
        </div>
      </div>
      <EditorIconButton
        title={translate('editor.toolbar.collapseInspector')}
        onClick={onCollapseInspector}
        data-ui="editor.floating.inspector-collapse-button"
      >
        <PanelRightClose size={16} strokeWidth={2} />
      </EditorIconButton>
    </div>
  );
}

function EditorFloatingInspectorConfirmDialog({
  documentController,
}: {
  documentController: EditorFloatingDocumentController;
}) {
  const confirmDialog = documentController.confirmDialog;

  if (!confirmDialog) {
    return null;
  }

  return (
    <ProductConfirmDialog
      title={confirmDialog.title}
      message={confirmDialog.message}
      confirmText={confirmDialog.confirmText}
      cancelText={confirmDialog.cancelText}
      onConfirm={documentController.onConfirmDialogConfirm}
      onCancel={documentController.onConfirmDialogCancel}
    />
  );
}

export function EditorFloatingInspector(props: EditorFloatingInspectorProps) {
  useAppLocale();
  const controller = props.documentController;
  const contentProps = createEditorInspectorContentPanelProps(props.hasImage, controller);
  const visibleContentProps =
    controller.inspector === 'file'
      ? { ...contentProps, inspector: 'tool' as const, showDocumentActions: false }
      : contentProps;
  const inspectorMeta = resolveFloatingInspectorMeta(props, controller);
  const layersPanelProps = createEditorInspectorLayersPanelProps(controller);
  const inspectorClassName = props.inspectorCollapsed
    ? INSPECTOR_PANEL_COLLAPSED_CLASS_NAME
    : INSPECTOR_PANEL_CLASS_NAME;

  return (
    <>
      <EditorInspectorSidebarHiddenInputs
        openImageInputRef={controller.openImageInputRef}
        importSessionInputRef={controller.importSessionInputRef}
        backgroundImageInputRef={controller.backgroundImageInputRef}
        setImageData={controller.setImageData}
        handleBackgroundImageUpload={controller.handleBackgroundImageUpload}
      />
      <FloatingChromePanel dataUi="editor.floating.inspector-panel" className={inspectorClassName}>
        <EditorFloatingInspectorHeader {...props} inspectorMeta={inspectorMeta} />
        {props.inspectorCollapsed ? (
          <EditorInspectorCompactToolbar
            commandGroups={controller.compactCommandGroups}
            collapsed
          />
        ) : (
          <div className={INSPECTOR_SCROLL_CLASS_NAME}>
            <EditorInspectorContent {...visibleContentProps} confirmDialog={null} />
          </div>
        )}
      </FloatingChromePanel>
      <FloatingChromePanel
        dataUi="editor.floating.layers-panel"
        className={LAYERS_PANEL_CLASS_NAME}
      >
        <EditorInspectorLayersPanel {...layersPanelProps} maxExpandedHeightRatio={1} />
      </FloatingChromePanel>
      <EditorFloatingInspectorConfirmDialog documentController={controller} />
    </>
  );
}
