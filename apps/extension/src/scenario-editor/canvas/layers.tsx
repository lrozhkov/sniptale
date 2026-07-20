import type { PointerEvent, RefObject } from 'react';
import type { renderScenarioSlide } from '../project/stage-render/slide';
import { ScenarioCanvasEndpointHandles } from './endpoints';
import { ScenarioCanvasResizeHandles } from './handles';
import { ScenarioCanvasImageContentControls } from './image-content';
import { ScenarioCanvasSelectionOverlay } from './selection-overlay';
import type { useScenarioCanvasInteractions } from './interactions';
import type { ScenarioCanvasStageProps } from './types';

type ScenarioCanvasInteractions = ReturnType<typeof useScenarioCanvasInteractions>;
type ScenarioCanvasRenderedSlide = ReturnType<typeof renderScenarioSlide>;

export function ScenarioCanvasInteractionLayers(props: {
  interactions: ScenarioCanvasInteractions;
  onEditImageElement?: ScenarioCanvasStageProps['onEditImageElement'];
  onSelectElement: ScenarioCanvasStageProps['onSelectElement'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  rendered: ScenarioCanvasRenderedSlide;
  scale: number;
  selectedRenderedElement: ScenarioCanvasRenderedSlide['elements'][number] | null;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <ScenarioCanvasSelectionOverlay
        elements={props.rendered.elements}
        onSelectElement={props.onSelectElement}
        onDragStart={(session, event) => {
          capturePointer(props.stageRef, event);
          props.interactions.handlers.beginTransaction(session, 'move');
          props.interactions.handlers.setDragSession(session);
        }}
      />
      <ScenarioCanvasResizeHandles
        renderedElement={props.selectedRenderedElement}
        viewportScale={props.scale}
        onResizeStart={(session, event) => {
          capturePointer(props.stageRef, event);
          props.interactions.handlers.beginTransaction(session, 'resize');
          props.interactions.handlers.setResizeSession(session);
        }}
      />
      <ScenarioCanvasLineAndImageLayers {...props} />
    </>
  );
}

function ScenarioCanvasLineAndImageLayers(props: {
  interactions: ScenarioCanvasInteractions;
  onEditImageElement?: ScenarioCanvasStageProps['onEditImageElement'];
  onUpdateElement: ScenarioCanvasStageProps['onUpdateElement'];
  scale: number;
  selectedRenderedElement: ScenarioCanvasRenderedSlide['elements'][number] | null;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <ScenarioCanvasEndpointHandles
        renderedElement={props.selectedRenderedElement}
        viewportScale={props.scale}
        onEndpointStart={(session, event) => {
          capturePointer(props.stageRef, event);
          props.interactions.handlers.beginTransaction(session, 'endpoint');
          props.interactions.handlers.setEndpointSession(session);
        }}
      />
      <ScenarioCanvasImageContentControls
        renderedElement={props.selectedRenderedElement}
        {...(props.onEditImageElement ? { onEditImageElement: props.onEditImageElement } : {})}
        onUpdateElement={props.onUpdateElement}
        viewportScale={props.scale}
        onImageContentPanStart={(session, event) => {
          capturePointer(props.stageRef, event);
          props.interactions.handlers.beginTransaction(session, 'imageContent');
          props.interactions.handlers.setImageContentSession(session);
        }}
      />
    </>
  );
}

function capturePointer(stageRef: RefObject<HTMLDivElement | null>, event: PointerEvent) {
  stageRef.current?.setPointerCapture?.(event.pointerId);
}
