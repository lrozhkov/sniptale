import { BrushCleaning, Crop, Eraser, PenLine } from 'lucide-react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ContentToolbarButton, ContentToolbarDivider } from '@sniptale/ui/content-toolbar';
import type { DrawingTool } from '../../../../features/drawing/public';
import {
  projectClientRectToContentUi,
  readContentUiScaleCompensation,
  resolveContentUiViewport,
} from '@sniptale/ui/floating-interactions/scale';
import { placeSelectionFloatingSurface } from './floating-placement';
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

export type CropDrawingInteraction = DrawingTool | 'eraser';

const resolveCropDrawingMenuLayout: NonNullable<
  ToolbarDrawingControlsOwner['resolveMenuLayout']
> = ({ anchor, menuWidth, menuHeight }) => {
  const toolbar = anchor.closest<HTMLElement>('.sniptale-selection-toolbar');
  const frame = toolbar
    ?.closest('.sniptale-selection-container')
    ?.querySelector<HTMLElement>('.sniptale-selection-final-frame');
  if (!toolbar || !frame) return null;
  const scale = readContentUiScaleCompensation(anchor);
  const anchorRect = projectClientRectToContentUi(anchor.getBoundingClientRect(), scale);
  const toolbarRect = projectClientRectToContentUi(toolbar.getBoundingClientRect(), scale);
  const cropRect = projectClientRectToContentUi(frame.getBoundingClientRect(), scale);
  const viewport = resolveContentUiViewport({
    clientWidth: window.innerWidth,
    clientHeight: window.innerHeight,
    scale,
  });
  const position = placeSelectionFloatingSurface({
    anchor: toolbarRect,
    exclusion: cropRect,
    protectedRect: toolbarRect,
    width: menuWidth,
    height: menuHeight,
    viewport,
  });
  const placement =
    position.y + menuHeight <= toolbarRect.y
      ? 'up'
      : position.y >= toolbarRect.y + toolbarRect.height
        ? 'down'
        : 'side';
  const leftSide = placement === 'side' && position.x + menuWidth <= toolbarRect.x;
  return {
    placement,
    style: {
      left: leftSide ? 'auto' : position.x - anchorRect.x,
      right: leftSide ? anchorRect.x + anchorRect.width - position.x - menuWidth : 'auto',
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
  drawing: boolean;
  interaction: CropDrawingInteraction;
  modeSlot: HTMLElement;
  controlsSlot: HTMLElement;
  onModeChange(drawing: boolean): void;
  onInteractionChange(interaction: CropDrawingInteraction): void;
}) {
  useAppLocale();
  const snapshot = useDrawingSessionSnapshot(props.controller.session);
  const resizeLabel = translate('content.toolbar.cropResizeMode');
  const drawingLabel = translate('content.toolbar.cropDrawingMode');
  const owner: ToolbarDrawingControlsOwner = {
    activeTool: props.interaction === 'eraser' ? null : snapshot.activeTool,
    persistOptionsDisclosure: true,
    preferredMenuPlacement: 'up',
    resolveMenuLayout: resolveCropDrawingMenuLayout,
    showActions: true,
    onToolActivated: props.onInteractionChange,
    renderActions: (snapshot) => (
      <>
        <ContentToolbarButton
          type="button"
          active={props.interaction === 'eraser'}
          aria-pressed={props.interaction === 'eraser'}
          aria-label={translate('content.toolbar.recordingDrawingEraser')}
          title={translate('content.toolbar.recordingDrawingEraser')}
          dataUi="content.crop.eraser"
          onClick={() => {
            props.controller.finalizeInteraction();
            props.onInteractionChange('eraser');
          }}
        >
          <Eraser size={18} />
        </ContentToolbarButton>
        <ContentToolbarButton
          type="button"
          tone="danger"
          disabled={snapshot.document.objects.length === 0}
          aria-label={translate('content.toolbar.drawingClear')}
          title={translate('content.toolbar.drawingClear')}
          dataUi="content.crop.clear"
          onClick={() => props.controller.session.clear()}
        >
          <BrushCleaning size={18} />
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
  onModeChange(drawing: boolean): void;
  onInteractionChange(interaction: CropDrawingInteraction): void;
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
      interaction: CropDrawingInteraction;
      slots: { mode: HTMLElement; controls: HTMLElement } | null;
    }) {
      layer.style.pointerEvents = state.drawing ? 'auto' : 'none';
      layer.style.cursor = state.drawing && state.interaction === 'eraser' ? 'crosshair' : '';
      flushSync(() => {
        root.render(
          <>
            <DrawingSurface
              controller={options.controller}
              active={state.drawing && state.interaction !== 'eraser'}
              chromeHidden={false}
              showSelectionChrome={state.drawing}
              onExit={() => options.onModeChange(false)}
            />
            {state.slots ? (
              <DrawingToolbar
                controller={options.controller}
                drawing={state.drawing}
                interaction={state.interaction}
                modeSlot={state.slots.mode}
                controlsSlot={state.slots.controls}
                onModeChange={options.onModeChange}
                onInteractionChange={options.onInteractionChange}
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
