import { Crop, PenLine, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ContentToolbarButton, ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import {
  projectClientRectToContentUi,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';
import type { CropDrawingHistory } from './drawing-history';
import { translate, useAppLocale } from '../../../../platform/i18n';
import {
  useDrawingSessionSnapshot,
  type ContentDrawingController,
} from '../../../drawing/controller';
import { DrawingSurface } from '../../../drawing/surface';
import {
  ToolbarDrawingControls,
  type ToolbarDrawingControlsOwner,
} from '../../../overlay/toolbar/controls/drawing';

const resolveCropDrawingMenuLayout: NonNullable<
  ToolbarDrawingControlsOwner['resolveMenuLayout']
> = ({ anchor, menuWidth, menuHeight }) => {
  const toolbar = anchor.closest<HTMLElement>('.sniptale-selection-toolbar');
  if (!toolbar) return null;
  const scale = readContentUiScaleCompensation(anchor);
  const anchorRect = projectClientRectToContentUi(anchor.getBoundingClientRect(), scale);
  const toolbarRect = projectClientRectToContentUi(toolbar.getBoundingClientRect(), scale);
  const viewport = resolveContentUiViewport({
    clientWidth: window.innerWidth,
    clientHeight: window.innerHeight,
    scale,
  });
  const above = toolbarRect.y - 18;
  const below = viewport.height - toolbarRect.y - toolbarRect.height - 18;
  const placement = above >= menuHeight || (below < menuHeight && above >= below) ? 'up' : 'down';
  const position = {
    x: Math.min(Math.max(8, toolbarRect.x), Math.max(8, viewport.width - menuWidth - 8)),
    y: Math.min(
      Math.max(
        8,
        placement === 'up'
          ? toolbarRect.y - menuHeight - 10
          : toolbarRect.y + toolbarRect.height + 10
      ),
      Math.max(8, viewport.height - menuHeight - 8)
    ),
  };
  return {
    placement,
    style: {
      left: position.x - anchorRect.x,
      right: 'auto',
      top: placement === 'up' ? 'auto' : position.y - anchorRect.y,
      bottom:
        placement === 'up' ? anchorRect.y + anchorRect.height - position.y - menuHeight : 'auto',
      maxHeight: 'calc(100vh - 16px)',
      overflowY: 'auto',
    },
  };
};

function DrawingToolbar(props: {
  controller: ContentDrawingController;
  history: CropDrawingHistory;
  drawing: boolean;
  modeSlot: HTMLElement;
  controlsSlot: HTMLElement;
  onModeChange(drawing: boolean): void;
}) {
  useAppLocale();
  const [, refresh] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    const unsubscribeHistory = props.history.subscribe(refresh);
    const unsubscribePending = props.controller.subscribePendingTextChange?.(refresh);
    return () => {
      unsubscribeHistory();
      unsubscribePending?.();
    };
  }, [props.history, props.controller]);
  const snapshot = useDrawingSessionSnapshot(props.controller.session);
  const history = props.history.getState();
  const pendingText = props.controller.hasPendingTextChange?.() ?? false;
  const resizeLabel = translate('content.toolbar.cropResizeMode');
  const drawingLabel = translate('content.toolbar.cropDrawingMode');
  const owner: ToolbarDrawingControlsOwner = {
    activeTool: snapshot.activeTool,
    persistOptionsDisclosure: true,
    preferredMenuPlacement: 'up',
    resolveMenuLayout: resolveCropDrawingMenuLayout,
    showActions: true,
    onToolActivated: refresh,
    renderActions: () => (
      <>
        <ContentToolbarButton
          type="button"
          disabled={!history.canUndo && !pendingText}
          aria-label={translate('editor.toolbar.undo')}
          title={translate('editor.toolbar.undo')}
          dataUi="content.crop.undo"
          onClick={() => props.history.undo()}
        >
          <Undo2 size={18} />
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
          disabled={!history.canRedo || pendingText}
          aria-label={translate('editor.toolbar.redo')}
          title={translate('editor.toolbar.redo')}
          dataUi="content.crop.redo"
          onClick={() => props.history.redo()}
        >
          <Redo2 size={18} />
        </ContentToolbarButton>
      </>
    ),
  };
  return (
    <>
      {createPortal(
        <div
          role="group"
          className="sniptale-selection-mode-switch"
          aria-label={translate('content.toolbar.modeMenuTitle')}
          data-ui="content.crop.mode-toggle"
        >
          <button
            type="button"
            className="sniptale-selection-mode-option"
            aria-pressed={!props.drawing}
            aria-label={resizeLabel}
            title={resizeLabel}
            data-ui="content.crop.mode.resize"
            onClick={() => props.onModeChange(false)}
          >
            <Crop size={18} />
          </button>
          <button
            type="button"
            className="sniptale-selection-mode-option"
            aria-pressed={props.drawing}
            aria-label={drawingLabel}
            title={drawingLabel}
            data-ui="content.crop.mode.drawing"
            onClick={() => props.onModeChange(true)}
          >
            <PenLine size={18} />
          </button>
        </div>,
        props.modeSlot
      )}
      {props.drawing
        ? createPortal(
            <>
              <ToolbarDrawingControls
                controller={props.controller}
                displayMode="horizontal"
                owner={owner}
              />
              <ContentToolbarDivider dataUi="content.crop.capture-divider" />
            </>,
            props.controlsSlot
          )
        : null}
    </>
  );
}

/** Mounts the stable drawing surface and projects crop-owned interaction state. */
export function createCropDrawingView(options: {
  container: HTMLElement;
  controller: ContentDrawingController;
  history: CropDrawingHistory;
  onModeChange(drawing: boolean): void;
  onExitDrawing(): void;
}) {
  const layer = document.createElement('div');
  layer.dataset['ui'] = 'content.crop.drawing-layer';
  Object.assign(layer.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2',
    pointerEvents: 'none',
  });
  options.container.appendChild(layer);
  const root = createRoot(layer);
  return {
    layer,
    render(state: {
      drawing: boolean;
      slots: { mode: HTMLElement; controls: HTMLElement } | null;
    }) {
      layer.style.pointerEvents = state.drawing ? 'auto' : 'none';
      flushSync(() => {
        root.render(
          <>
            <DrawingSurface
              controller={options.controller}
              active={state.drawing}
              chromeHidden={false}
              showSelectionChrome={state.drawing}
              onExit={options.onExitDrawing}
            />
            {state.slots ? (
              <DrawingToolbar
                controller={options.controller}
                history={options.history}
                drawing={state.drawing}
                modeSlot={state.slots.mode}
                controlsSlot={state.slots.controls}
                onModeChange={options.onModeChange}
              />
            ) : null}
          </>
        );
      });
    },
    dispose() {
      root.unmount();
      layer.remove();
    },
  };
}
