import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Layers3 } from 'lucide-react';
import {
  FloatingChromePanel,
  FloatingChromeToolbar,
  floatingChromeClassNames,
} from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { EditorInspectorLayersPanel } from '../../inspector/layers';
import { LayerInsertImageControl } from '../../inspector/layers/file-input';
import { createEditorInspectorLayersPanelProps } from '../../inspector/sidebar-expanded-content/helpers';
import { EditorIconButton } from '../../chrome/ui';
import type { EditorFloatingDocumentController } from './document-bar';

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
  ].join(' ')
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
  onExpand,
  preferenceError,
}: {
  onExpand: () => void;
  preferenceError: string | null;
}) {
  return (
    <div className={LAYERS_PANEL_COLLAPSED_CLASS_NAME}>
      <FloatingLayersPreferenceError message={preferenceError} />
      <FloatingChromeToolbar dataUi="editor.floating.layers-collapsed-toolbar" className="relative">
        <EditorIconButton
          title={translate('editor.toolbar.layersTitle')}
          onClick={onExpand}
          data-ui="editor.floating.layers.expand-button"
        >
          <Layers3 size={17} strokeWidth={2} />
        </EditorIconButton>
        <LayerInsertImageControl />
      </FloatingChromeToolbar>
    </div>
  );
}

function EditorFloatingExpandedLayersPanel(props: {
  documentController: EditorFloatingDocumentController;
  height: number;
  onCollapse: () => void;
  preferenceError: string | null;
  startResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  const layersPanelProps = createEditorInspectorLayersPanelProps(props.documentController);

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
      <EditorInspectorLayersPanel
        {...layersPanelProps}
        expanded
        fillContainer
        maxExpandedHeightRatio={1}
        onCollapsePanel={props.onCollapse}
      />
      <FloatingLayersPreferenceError message={props.preferenceError} />
    </FloatingChromePanel>
  );
}

export function EditorFloatingLayersPanel({
  collapsed,
  documentController,
  heightRatio,
  preferenceError,
  onCollapse,
  onExpand,
  onHeightRatioChange,
}: {
  collapsed: boolean;
  documentController: EditorFloatingDocumentController;
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

  if (collapsed) {
    return (
      <EditorFloatingLayersCollapsedToolbar onExpand={onExpand} preferenceError={preferenceError} />
    );
  }

  return (
    <EditorFloatingExpandedLayersPanel
      documentController={documentController}
      height={height}
      onCollapse={onCollapse}
      preferenceError={preferenceError}
      startResize={startResize}
    />
  );
}
