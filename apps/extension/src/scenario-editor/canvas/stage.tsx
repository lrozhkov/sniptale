import { useRef } from 'react';
import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioDrawingLayer } from '../drawing';
import { ScenarioCanvasFloatingControls } from './controls';
import { useSelectedImageWheelZoom } from './image-wheel';
import { useScenarioCanvasInsertMode } from './insert-mode';
import { ScenarioCanvasInteractionLayers } from './layers';
import { useScenarioCanvasMarquee } from './marquee';
import { createScenarioCanvasMagnetScope, useScenarioCanvasStageModel } from './model';
import { ScenarioCanvasNavigator } from './navigator';
import { ScenarioCanvasStageOverlays } from './overlays';
import { ScenarioCanvasSvgAdapter } from './render-adapter';
import { resolveCanvasViewportLayout } from './stage-layout';
import type {
  ScenarioCanvasGuides,
  ScenarioCanvasInteractions,
  ScenarioCanvasRenderedSlide,
} from './stage-types';
import type { ScenarioCanvasStageProps } from './types';
import { SCENARIO_CANVAS_GRID_SIZE } from './viewport';
import { useScenarioCanvasViewport } from './viewport-state';
import { useScenarioCanvasZoomAnchor } from './viewport-scroll';

function releasePointerCapture(stageRef: RefObject<HTMLDivElement | null>, pointerId: number) {
  if (stageRef.current?.hasPointerCapture?.(pointerId)) {
    stageRef.current.releasePointerCapture(pointerId);
  }
}

export function ScenarioCanvasStage(props: ScenarioCanvasStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const runtime = useScenarioCanvasStageRuntime(props, stageRef);
  return <ScenarioCanvasViewportSurface {...runtime} stageRef={stageRef} />;
}

function useScenarioCanvasStageRuntime(
  props: ScenarioCanvasStageProps,
  stageRef: RefObject<HTMLDivElement | null>
) {
  const viewport = useResolvedScenarioCanvasViewport(props);
  const model = useResolvedScenarioCanvasStageModel(props, viewport);
  const marquee = useScenarioCanvasMarquee({
    onSelectElement: props.onSelectElement,
    onSelectSlide: props.onSelectSlide,
    renderedElements: model.rendered.elements,
    scale: viewport.scale,
    stageRef,
  });
  const insertMode = useScenarioCanvasInsertMode({
    activeInsertKind: props.activeInsertKind,
    onClearActiveInsertKind: props.onClearActiveInsertKind,
    onInsertElementAtPoint: props.onInsertElementAtPoint,
    onInsertElementFromDrag: props.onInsertElementFromDrag,
    scale: viewport.scale,
    stageRef,
  });
  return {
    ...resolveScenarioCanvasStageHandlers({
      insertMode,
      interactions: model.interactions,
      marquee,
      props,
    }),
    ...resolveScenarioCanvasStageRuntimeViewProps({
      guides: model.guides,
      insertMode,
      interactions: model.interactions,
      marquee,
      props,
      viewport,
    }),
    onSelectElement: props.onSelectElement,
    onSelectSlide: props.onSelectSlide,
    onUpdateElement: props.onUpdateElement,
    rendered: model.rendered,
    scale: viewport.scale,
    selectedRenderedElement: model.selectedRenderedElement,
    viewport,
    withFloatingControls: props.viewportController === undefined,
    ...(props.drawingDocument ? { drawingDocument: props.drawingDocument } : {}),
  };
}

function useResolvedScenarioCanvasViewport(props: ScenarioCanvasStageProps) {
  const internalViewport = useScenarioCanvasViewport({
    height: props.slide.canvas.height,
    width: props.slide.canvas.width,
  });
  return props.viewportController ?? internalViewport;
}

function useResolvedScenarioCanvasStageModel(
  props: ScenarioCanvasStageProps,
  viewport: ReturnType<typeof useScenarioCanvasViewport>
) {
  const snapGridSize =
    viewport.gridVisible && viewport.snapToGrid ? SCENARIO_CANVAS_GRID_SIZE : null;
  return useScenarioCanvasStageModel({
    magnetScope: createScenarioCanvasMagnetScope({
      enabled: viewport.magnetEnabled,
      slide: props.slide,
    }),
    props,
    scale: viewport.scale,
    snapGridSize,
  });
}

function resolveScenarioCanvasStageRuntimeViewProps(args: {
  guides: ScenarioCanvasGuides;
  insertMode: ReturnType<typeof useScenarioCanvasInsertMode>;
  interactions: ScenarioCanvasInteractions;
  marquee: ReturnType<typeof useScenarioCanvasMarquee>;
  props: ScenarioCanvasStageProps;
  viewport: ReturnType<typeof useScenarioCanvasViewport>;
}) {
  return {
    assetLoading: args.props.assetsLoading ?? false,
    gridVisible: args.viewport.gridVisible,
    guides: args.guides,
    interactions: args.interactions,
    insertPreviewFrame: args.insertMode.frame,
    marqueeFrame: args.marquee.frame,
    ...(args.props.onEditImageElement ? { onEditImageElement: args.props.onEditImageElement } : {}),
  };
}

function resolveScenarioCanvasStageHandlers(args: {
  insertMode: ReturnType<typeof useScenarioCanvasInsertMode>;
  interactions: ScenarioCanvasInteractions;
  marquee: ReturnType<typeof useScenarioCanvasMarquee>;
  props: ScenarioCanvasStageProps;
}) {
  const { insertMode, interactions, marquee, props } = args;
  return {
    onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => insertMode.begin(event),
    onPointerCancel: () => {
      insertMode.cancel();
      marquee.cancel();
    },
    onPointerDown: (event: PointerEvent<HTMLDivElement>) => marquee.begin(event),
    onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Escape' && props.activeInsertKind) {
        insertMode.cancel();
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      interactions.handlers.handleKeyDown(event);
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
      if (!insertMode.update(event)) {
        marquee.update(event);
      }
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>) => {
      if (!insertMode.finish(event)) {
        marquee.finish();
      }
    },
  };
}

function ScenarioCanvasViewportSurface(
  props: ScenarioCanvasStageSurfaceProps & {
    viewport: ReturnType<typeof useScenarioCanvasViewport>;
    withFloatingControls: boolean;
  }
) {
  const scaledFrameRef = useRef<HTMLDivElement>(null);
  const viewportLayout = resolveCanvasViewportLayout({
    canvas: props.rendered.canvas,
    scale: props.scale,
    viewportInsets: props.viewport.viewportInsets,
    withFloatingControls: props.withFloatingControls,
  });
  useScenarioCanvasZoomAnchor({
    scale: props.scale,
    scaledFrameRef,
    viewportRef: props.viewport.viewportRef,
  });

  return (
    <div
      ref={props.viewport.viewportRef}
      className="relative h-full min-h-0 overflow-auto bg-[var(--sniptale-color-surface-canvas)]"
    >
      {props.withFloatingControls ? (
        <ScenarioCanvasFloatingControls {...props.viewport.controls} />
      ) : null}
      <div className={viewportLayout.className} style={viewportLayout.style}>
        <div
          ref={scaledFrameRef}
          data-ui="scenario.canvas.scaled-frame"
          style={{
            height: props.rendered.canvas.height * props.scale,
            width: props.rendered.canvas.width * props.scale,
          }}
        >
          <ScenarioCanvasStageSurface {...props} />
        </div>
      </div>
      {props.viewport.controls.navigatorVisible === true ? (
        <ScenarioCanvasNavigator
          rendered={props.rendered}
          scaledFrameRef={scaledFrameRef}
          viewportRef={props.viewport.viewportRef}
        />
      ) : null}
    </div>
  );
}
interface ScenarioCanvasStageSurfaceProps {
  assetLoading: boolean;
  gridVisible: boolean;
  guides: ScenarioCanvasGuides;
  interactions: ScenarioCanvasInteractions;
  insertPreviewFrame: ScenarioElementFrame | null;
  marqueeFrame: ScenarioElementFrame | null;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onEditImageElement?: ScenarioCanvasStageProps['onEditImageElement'];
  onSelectElement: ScenarioCanvasStageProps['onSelectElement'];
  onSelectSlide: ScenarioCanvasStageProps['onSelectSlide'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  drawingDocument?: NonNullable<ScenarioCanvasStageProps['drawingDocument']>;
  rendered: ScenarioCanvasRenderedSlide;
  scale: number;
  selectedRenderedElement: ScenarioCanvasRenderedSlide['elements'][number] | null;
  stageRef: RefObject<HTMLDivElement | null>;
}

function ScenarioCanvasStageSurface(props: ScenarioCanvasStageSurfaceProps) {
  useSelectedImageWheelZoom({
    onUpdateElement: props.onUpdateElement,
    selectedRenderedElement: props.selectedRenderedElement,
    stageRef: props.stageRef,
  });

  return (
    <div
      ref={props.stageRef}
      data-ui="scenario.canvas.stage"
      tabIndex={0}
      onPointerDownCapture={props.onPointerDownCapture}
      onPointerDown={props.onPointerDown}
      onKeyDown={props.onKeyDown}
      onPointerMove={(event) => {
        props.interactions.handlers.updatePreview(event);
        props.onPointerMove(event);
      }}
      onPointerUp={(event) => {
        releasePointerCapture(props.stageRef, event.pointerId);
        if (props.interactions.hasActiveInteraction) {
          props.interactions.handlers.commitInteraction(event);
        } else {
          props.onPointerUp(event);
        }
      }}
      onPointerCancel={() => {
        props.interactions.handlers.clearPreview(false);
        props.onPointerCancel();
      }}
      className="relative touch-none rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)] shadow-[0_20px_48px_rgba(15,23,42,0.14)]"
      style={{
        height: props.rendered.canvas.height,
        transform: `scale(${props.scale})`,
        transformOrigin: 'top left',
        width: props.rendered.canvas.width,
      }}
    >
      <ScenarioCanvasSvgAdapter svg={props.rendered.svg} />
      <ScenarioCanvasDrawingLayer {...props} />
      <ScenarioCanvasStageOverlays {...props} gridSize={SCENARIO_CANVAS_GRID_SIZE} />
      <ScenarioCanvasInteractionLayers {...props} />
    </div>
  );
}

function ScenarioCanvasDrawingLayer(props: ScenarioCanvasStageSurfaceProps) {
  if (!props.drawingDocument) {
    return null;
  }
  return (
    <ScenarioDrawingLayer
      document={props.drawingDocument}
      height={props.rendered.canvas.height}
      width={props.rendered.canvas.width}
    />
  );
}
