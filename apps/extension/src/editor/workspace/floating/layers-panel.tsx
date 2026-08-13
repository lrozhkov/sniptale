import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { FloatingChromePanel, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { EditorInspectorLayersPanel } from '../../inspector/layers';
import { EditorInspectorContent } from '../../inspector/content';
import {
  createEditorInspectorContentPanelProps,
  createEditorInspectorLayersPanelProps,
} from '../../inspector/sidebar-expanded-content/helpers';
import { useEditorController } from '../../application/controller-context';
import { createEditorToolbarActions } from '../toolbar/actions';
import type { EditorFloatingDocumentController } from './document-bar';
import {
  EditorFloatingLayersNavigation,
  resolveEditorLayersPanelMode,
  type EditorLayersPanelMode,
} from './layers-panel-navigation';

const LAYERS_PANEL_DEFAULT_HEIGHT = 320;
const LAYERS_PANEL_MIN_HEIGHT = 248;
const VIEW_TOOLBAR_TOP_OFFSET = 12;
const VIEW_TOOLBAR_HEIGHT_GUARD = 44;
const VIEW_TOOLBAR_POPOVER_GAP = 12;
const VIEW_TOOLBAR_MAP_POPOVER_HEIGHT_GUARD = 112;
const VIEW_TOOLBAR_TO_LAYERS_GAP = 12;
const LAYERS_PANEL_TOP_GUARD =
  VIEW_TOOLBAR_TOP_OFFSET +
  VIEW_TOOLBAR_HEIGHT_GUARD +
  VIEW_TOOLBAR_POPOVER_GAP +
  VIEW_TOOLBAR_MAP_POPOVER_HEIGHT_GUARD +
  VIEW_TOOLBAR_TO_LAYERS_GAP;
const LAYERS_PANEL_BOTTOM_GAP = 12;
const LAYERS_HEIGHT_RATIO_PRECISION = 10_000;

const LAYERS_PANEL_CLASS_NAME = floatingChromeClassNames(
  'relative flex shrink-0 flex-col overflow-hidden',
  'h-full min-h-[15.5rem] w-full'
);

const LAYERS_PANEL_COLLAPSED_CLASS_NAME = floatingChromeClassNames(
  [
    'absolute bottom-[calc(0.75rem+var(--editor-floating-edge-bottom,0px))]',
    'right-[calc(0.75rem+var(--editor-floating-edge-right,0px))] z-40',
    'max-[720px]:bottom-[calc(4.75rem+var(--editor-floating-edge-bottom,0px))]',
  ].join(' '),
  'pointer-events-auto max-w-[calc(100vw-1.5rem)] overflow-x-auto'
);

const LAYERS_RESIZE_HANDLE_CLASS_NAME = [
  'absolute inset-x-0 top-0 z-10 h-2 cursor-ns-resize',
  'before:absolute before:left-1/2 before:top-1 before:h-0.5 before:w-12',
  'before:-translate-x-1/2 before:rounded-full',
  'before:bg-[color:color-mix(in_srgb,var(--sniptale-color-border-strong)_70%,transparent)]',
].join(' ');

function getMaxLayersPanelHeight() {
  if (typeof window === 'undefined') {
    return LAYERS_PANEL_DEFAULT_HEIGHT;
  }

  return Math.max(
    LAYERS_PANEL_MIN_HEIGHT,
    window.innerHeight - LAYERS_PANEL_TOP_GUARD - LAYERS_PANEL_BOTTOM_GAP
  );
}

function clampLayersPanelHeight(value: number) {
  return Math.max(LAYERS_PANEL_MIN_HEIGHT, Math.min(getMaxLayersPanelHeight(), value));
}

function resolveLayersPanelHeight(heightRatio: number | null) {
  if (heightRatio === null) {
    return clampLayersPanelHeight(LAYERS_PANEL_DEFAULT_HEIGHT);
  }

  return clampLayersPanelHeight(getMaxLayersPanelHeight() * heightRatio);
}

function resolveLayersPanelHeightRatio(height: number) {
  const preciseRatio = (height / getMaxLayersPanelHeight()) * LAYERS_HEIGHT_RATIO_PRECISION;
  return Math.round(preciseRatio) / LAYERS_HEIGHT_RATIO_PRECISION;
}

function useResizableLayersPanelHeight(args: {
  heightRatio: number | null;
  onHeightRatioChange: (heightRatio: number | null) => void;
}) {
  const { heightRatio, onHeightRatioChange } = args;
  const [height, setHeight] = useState(() => resolveLayersPanelHeight(heightRatio));

  useEffect(() => {
    setHeight(resolveLayersPanelHeight(heightRatio));
  }, [heightRatio]);

  useEffect(() => {
    const handleResize = () => setHeight(resolveLayersPanelHeight(heightRatio));
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [heightRatio]);

  const startResize = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);
      const pointerId = event.pointerId;
      const startY = event.clientY;
      const startHeight = height;
      let nextHeight = startHeight;
      const handlePointerMove = (moveEvent: PointerEvent) => {
        nextHeight = clampLayersPanelHeight(startHeight + startY - moveEvent.clientY);
        setHeight(nextHeight);
      };
      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerUp);
        if (target.hasPointerCapture(pointerId)) {
          target.releasePointerCapture(pointerId);
        }
        onHeightRatioChange(resolveLayersPanelHeightRatio(nextHeight));
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerUp);
    },
    [height, onHeightRatioChange]
  );

  return { height, startResize };
}

function FloatingLayersPreferenceError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      data-ui="editor.floating.layers.preference-error"
      className={[
        'mx-3 mb-3 rounded-md border px-2.5 py-1.5 text-xs leading-5',
        'border-[color:color-mix(in_srgb,var(--sniptale-color-danger)_28%,transparent)]',
        'bg-[color:color-mix(in_srgb,var(--sniptale-color-danger)_8%,transparent)]',
        'text-[var(--sniptale-color-danger)]',
      ].join(' ')}
    >
      {message}
    </div>
  );
}

function EditorFloatingLayersCollapsedToolbar({
  activeMode,
  onSelectMode,
  onExpand,
  preferenceError,
}: {
  activeMode: EditorLayersPanelMode;
  onSelectMode: (mode: EditorLayersPanelMode) => void;
  onExpand: () => void;
  preferenceError: string | null;
}) {
  return (
    <div className={LAYERS_PANEL_COLLAPSED_CLASS_NAME}>
      <FloatingLayersPreferenceError message={preferenceError} />
      <div data-ui="editor.floating.layers-collapsed-toolbar">
        <EditorFloatingLayersNavigation
          activeMode={activeMode}
          collapsed
          onSelectMode={(mode) => {
            onSelectMode(mode);
            onExpand();
          }}
        />
      </div>
    </div>
  );
}

function EditorFloatingLayersPanelBody(props: {
  activeMode: EditorLayersPanelMode;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
}) {
  if (props.activeMode === 'layers') {
    const layersPanelProps = createEditorInspectorLayersPanelProps(props.documentController);
    return (
      <EditorInspectorLayersPanel
        {...layersPanelProps}
        expanded
        fillContainer
        maxExpandedHeightRatio={1}
      />
    );
  }

  const contentProps = createEditorInspectorContentPanelProps(
    props.hasImage,
    props.documentController
  );
  return (
    <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 [scrollbar-gutter:stable]">
      <EditorInspectorContent
        {...contentProps}
        inspector={props.activeMode}
        showDocumentActions={false}
        confirmDialog={null}
      />
    </div>
  );
}

function EditorFloatingExpandedLayersPanel(props: {
  activeMode: EditorLayersPanelMode;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
  height: number;
  onCollapse: () => void;
  onSelectMode: (mode: EditorLayersPanelMode) => void;
  preferenceError: string | null;
  startResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <FloatingChromePanel
      dataUi="editor.floating.layers-panel"
      className={LAYERS_PANEL_CLASS_NAME}
      style={{ height: props.height }}
    >
      <div
        aria-hidden="true"
        className={LAYERS_RESIZE_HANDLE_CLASS_NAME}
        data-ui="editor.floating.layers.resize-handle"
        onPointerDown={props.startResize}
      />
      <EditorFloatingLayersNavigation
        activeMode={props.activeMode}
        onCollapse={props.onCollapse}
        onSelectMode={props.onSelectMode}
      />
      <EditorFloatingLayersPanelBody
        activeMode={props.activeMode}
        documentController={props.documentController}
        hasImage={props.hasImage}
      />
      <FloatingLayersPreferenceError message={props.preferenceError} />
    </FloatingChromePanel>
  );
}

export function EditorFloatingLayersPanel({
  collapsed,
  documentController,
  hasImage,
  heightRatio,
  preferenceError,
  onCollapse,
  onExpand,
  onHeightRatioChange,
}: {
  collapsed: boolean;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
  heightRatio: number | null;
  preferenceError: string | null;
  onCollapse: () => void;
  onExpand: () => void;
  onHeightRatioChange: (heightRatio: number | null) => void;
}) {
  const { height, startResize } = useResizableLayersPanelHeight({
    heightRatio,
    onHeightRatioChange,
  });
  const editorController = useEditorController();
  const activeMode = resolveEditorLayersPanelMode(documentController.inspector);
  const toolbarActions = createEditorToolbarActions({
    controller: editorController,
    hasImage,
    inspector: documentController.inspector,
    setActiveTool: documentController.setActiveTool,
    setInspector: documentController.setInspector,
  });
  const handleSelectMode = (mode: EditorLayersPanelMode) => {
    if (mode === activeMode) return;
    if (mode === 'layers') {
      toolbarActions.activateTool('select');
      return;
    }
    toolbarActions.toggleInspector(mode);
  };

  if (collapsed) {
    return (
      <EditorFloatingLayersCollapsedToolbar
        activeMode={activeMode}
        onExpand={onExpand}
        onSelectMode={handleSelectMode}
        preferenceError={preferenceError}
      />
    );
  }

  return (
    <EditorFloatingExpandedLayersPanel
      activeMode={activeMode}
      documentController={documentController}
      hasImage={hasImage}
      height={height}
      onCollapse={onCollapse}
      onSelectMode={handleSelectMode}
      preferenceError={preferenceError}
      startResize={startResize}
    />
  );
}
