import { X } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { EditorInspectorContent } from '../../inspector/content';
import { createEditorInspectorContentPanelProps } from '../../inspector/sidebar-expanded-content/helpers';
import { EditorIconButton } from '../../chrome/ui';
import { useOptionalEditorController } from '../../application/controller-context';
import type { EditorToolbarContentProps } from '../toolbar/types';
import type { EditorFloatingDocumentController } from './document-bar';
import type { EditorFloatingRightUtilityMode } from './routes';

const UTILITY_PANEL_CLASS_NAME = floatingChromeClassNames(
  'absolute left-[4.75rem] z-50 flex max-h-[min(42rem,calc(100vh-1.5rem))]',
  'min-h-0 w-[min(24rem,calc(100vw-6rem))] -translate-y-1/2 flex-col overflow-hidden',
  'max-[720px]:left-3 max-[720px]:right-3 max-[720px]:top-auto max-[720px]:bottom-[4.75rem]',
  'max-[720px]:translate-y-0',
  'max-[720px]:max-h-[70vh] max-[720px]:w-auto max-[720px]:max-w-none'
);

const UTILITY_HEADER_CLASS_NAME = [
  'flex shrink-0 items-center gap-3 border-b px-4 py-3',
  'border-[color:color-mix(in_srgb,var(--sniptale-color-border-soft)_76%,transparent)]',
].join(' ');

const UTILITY_HEADER_TITLE_CLASS_NAME =
  'truncate text-[12px] font-bold uppercase leading-4 text-[color:var(--sniptale-color-text-secondary)]';

const UTILITY_SCROLL_CLASS_NAME =
  'min-h-0 overflow-x-hidden overflow-y-auto p-4 [scrollbar-gutter:stable_both-edges]';

const DEFAULT_UTILITY_TOP = 0.5;
const UTILITY_VERTICAL_GAP = 12;

function getUtilityAnchorSelector(mode: EditorFloatingRightUtilityMode): string {
  return `[data-ui="editor.toolbar.inspector.${mode}"]`;
}

function getUtilityPanelSelector(mode: EditorFloatingRightUtilityMode): string {
  return `[data-ui="editor.floating.utility-panel.${mode}"]`;
}

function resolveUtilityPanelTop(
  mode: EditorFloatingRightUtilityMode,
  panelElement: HTMLElement | null
): number {
  const anchorElement = document.querySelector<HTMLElement>(getUtilityAnchorSelector(mode));
  if (!anchorElement) {
    return window.innerHeight * DEFAULT_UTILITY_TOP;
  }

  const anchorRect = anchorElement.getBoundingClientRect();
  const panelHeight = panelElement?.getBoundingClientRect().height ?? 0;
  const preferredTop = anchorRect.top + anchorRect.height / 2;
  if (panelHeight <= 0) {
    return preferredTop;
  }

  const halfHeight = panelHeight / 2;
  return Math.min(
    Math.max(preferredTop, halfHeight + UTILITY_VERTICAL_GAP),
    window.innerHeight - halfHeight - UTILITY_VERTICAL_GAP
  );
}

function useUtilityPanelTop(mode: EditorFloatingRightUtilityMode) {
  const [top, setTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const panelElement = document.querySelector<HTMLElement>(getUtilityPanelSelector(mode));
      setTop(resolveUtilityPanelTop(mode, panelElement));
    };

    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mode]);

  return top;
}

function isResizeUtilityMode(mode: EditorFloatingRightUtilityMode): boolean {
  return mode === 'canvas-size' || mode === 'image-size';
}

function useUtilityPanelCloseHandler(
  documentController: EditorFloatingDocumentController,
  mode: EditorFloatingRightUtilityMode
) {
  const editorController = useOptionalEditorController();

  return () => {
    if (isResizeUtilityMode(mode)) {
      editorController?.cancelCropMode();
      documentController.setActiveTool('select');
    }
    documentController.setInspector('tool');
  };
}

export function EditorFloatingUtilityPanel({
  documentController,
  hasImage,
  inspectorMeta,
  mode,
}: Pick<EditorToolbarContentProps, 'hasImage' | 'inspectorMeta'> & {
  documentController: EditorFloatingDocumentController;
  mode: EditorFloatingRightUtilityMode;
}) {
  const contentProps = createEditorInspectorContentPanelProps(hasImage, documentController);
  const top = useUtilityPanelTop(mode);
  const handleClose = useUtilityPanelCloseHandler(documentController, mode);

  return (
    <FloatingChromePanel
      dataUi={`editor.floating.utility-panel.${mode}`}
      className={UTILITY_PANEL_CLASS_NAME}
      style={{ top: top ?? '50%' }}
    >
      <div className={UTILITY_HEADER_CLASS_NAME}>
        <div className="min-w-0 flex-1">
          <div className={UTILITY_HEADER_TITLE_CLASS_NAME}>{inspectorMeta.title}</div>
        </div>
        <EditorIconButton
          title={translate('common.actions.close')}
          onClick={handleClose}
          data-ui="editor.floating.utility-panel.close-button"
        >
          <X size={16} strokeWidth={2} />
        </EditorIconButton>
      </div>
      <div className={UTILITY_SCROLL_CLASS_NAME}>
        <EditorInspectorContent
          {...contentProps}
          inspector={mode}
          showDocumentActions={false}
          confirmDialog={null}
        />
      </div>
    </FloatingChromePanel>
  );
}
