import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
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

import { EditorFloatingLayerEffectsPanel } from './layer-effects-panel';
import { LAYERS_PANEL_DEFAULT_HEIGHT, useResizableLayersPanelHeight } from './layers-panel-height';

const LAYERS_PANEL_CLASS_NAME = floatingChromeClassNames(
  'relative flex shrink-0 flex-col overflow-hidden',
  'h-full min-h-0 w-full'
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
  if (props.documentController.inspector === 'layer-effects') {
    return (
      <EditorFloatingLayerEffectsPanel
        documentController={props.documentController}
        hasImage={props.hasImage}
      />
    );
  }

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
    <div
      className={[
        'min-h-0 flex-1 overflow-x-hidden overflow-y-auto p-3 [scrollbar-gutter:stable]',
      ].join(' ')}
    >
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
  const panelRef = useRef<HTMLDivElement>(null);
  const previousInspector = useRef(props.documentController.inspector);
  useEffect(() => {
    if (
      previousInspector.current === 'layer-effects' &&
      props.documentController.inspector === 'tool'
    ) {
      panelRef.current
        ?.querySelector<HTMLElement>('[data-ui="editor.floating.layers.mode.layers"]')
        ?.focus();
    }
    previousInspector.current = props.documentController.inspector;
  }, [props.documentController.inspector]);

  return (
    <FloatingChromePanel
      ref={panelRef}
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
    defaultHeight:
      documentController.inspector === 'layer-effects' ? 520 : LAYERS_PANEL_DEFAULT_HEIGHT,
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
    if (mode === activeMode && documentController.inspector !== 'layer-effects') return;
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
      onCollapse={() => {
        if (documentController.inspector === 'canvas-size') toolbarActions.activateTool('select');
        if (documentController.inspector === 'layer-effects')
          documentController.setInspector('tool');
        onCollapse();
      }}
      onSelectMode={handleSelectMode}
      preferenceError={preferenceError}
      startResize={startResize}
    />
  );
}
