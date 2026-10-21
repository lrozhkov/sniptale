import { Crop, PenLine, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useReducer } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ContentToolbarButton, ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import { CommandPressScope } from '@sniptale/ui/control-language/press';
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
import {
  resolveToolbarDrawingMenuStyle,
  TOOLBAR_MENU_SHELL_GAP_PX,
  TOOLBAR_MENU_VIEWPORT_MARGIN_PX,
} from '../../../overlay/toolbar/menu/floating.helpers';

const resolveCropDrawingMenuLayout: NonNullable<
  ToolbarDrawingControlsOwner['resolveMenuLayout']
> = ({ anchor, menuWidth, menuHeight, surfaceInset = 0 }) => {
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
  const visibleHeight = Math.max(0, menuHeight - surfaceInset * 2);
  const visibleWidth = Math.max(0, menuWidth - surfaceInset * 2);
  const margin = TOOLBAR_MENU_VIEWPORT_MARGIN_PX;
  const gap = TOOLBAR_MENU_SHELL_GAP_PX;
  const above = toolbarRect.y - gap - margin;
  const below = viewport.height - toolbarRect.y - toolbarRect.height - gap - margin;
  const frame = toolbar
    .closest('.sniptale-selection-container')
    ?.querySelector<HTMLElement>('.sniptale-selection-final-frame');
  const cropRect = frame
    ? projectClientRectToContentUi(frame.getBoundingClientRect(), scale)
    : null;
  const left = Math.min(
    Math.max(margin, anchorRect.x),
    Math.max(margin, viewport.width - visibleWidth - margin)
  );
  const adjacentPositions = [
    { placement: 'up', top: toolbarRect.y - visibleHeight - gap, fits: above >= visibleHeight },
    {
      placement: 'down',
      top: toolbarRect.y + toolbarRect.height + gap,
      fits: below >= visibleHeight,
    },
  ] as const;
  const clearPosition = cropRect
    ? adjacentPositions.find(
        (candidate) =>
          candidate.fits &&
          (left + visibleWidth <= cropRect.x ||
            left >= cropRect.x + cropRect.width ||
            candidate.top + visibleHeight <= cropRect.y ||
            candidate.top >= cropRect.y + cropRect.height)
      )
    : undefined;
  const placement =
    clearPosition?.placement ??
    (above >= visibleHeight || (below < visibleHeight && above >= below) ? 'up' : 'down');
  return {
    placement,
    style:
      resolveToolbarDrawingMenuStyle({
        anchorEl: anchor,
        menuWidth,
        menuHeight,
        placement,
        surfaceInset,
      }) ?? {},
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
          tone="utility"
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
          tone="utility"
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
          <CommandPressScope value={true}>
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
          </CommandPressScope>
        );
      });
    },
    dispose() {
      root.unmount();
      layer.remove();
    },
  };
}
