import { useRef, useState } from 'react';
import type { MutableRefObject, PointerEvent, RefObject } from 'react';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasStageProps } from './types';
import {
  createScenarioCanvasMarqueeFrame,
  doesScenarioFrameIntersect,
  getScenarioCanvasPointFromClient,
  type ScenarioCanvasPoint,
} from './viewport';

export function useScenarioCanvasMarquee(args: {
  onSelectElement: ScenarioCanvasStageProps['onSelectElement'];
  onSelectSlide: ScenarioCanvasStageProps['onSelectSlide'];
  renderedElements: readonly ScenarioRenderedElement[];
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const originRef = useRef<ScenarioCanvasPoint | null>(null);
  const currentRef = useRef<ScenarioCanvasPoint | null>(null);
  const [origin, setOrigin] = useState<ScenarioCanvasPoint | null>(null);
  const [current, setCurrent] = useState<ScenarioCanvasPoint | null>(null);
  const frame = origin && current ? createScenarioCanvasMarqueeFrame(origin, current) : null;

  return {
    begin: (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const point = getPointerPoint(args.stageRef, args.scale, event);
      originRef.current = point;
      currentRef.current = point;
      setOrigin(point);
      setCurrent(point);
      args.stageRef.current?.setPointerCapture?.(event.pointerId);
    },
    cancel: () => {
      clearMarqueeRefs(originRef, currentRef);
      setOrigin(null);
      setCurrent(null);
    },
    finish: () => {
      const finalFrame = createFinalMarqueeFrame(originRef.current, currentRef.current);
      finishMarqueeSelection({ ...args, frame: finalFrame });
      clearMarqueeRefs(originRef, currentRef);
      setOrigin(null);
      setCurrent(null);
    },
    frame,
    update: (event: PointerEvent<HTMLDivElement>) => {
      if (originRef.current) {
        const point = getPointerPoint(args.stageRef, args.scale, event);
        currentRef.current = point;
        setCurrent(point);
      }
    },
  };
}

function finishMarqueeSelection(args: {
  frame: ScenarioElementFrame | null;
  onSelectElement: ScenarioCanvasStageProps['onSelectElement'];
  onSelectSlide: ScenarioCanvasStageProps['onSelectSlide'];
  renderedElements: readonly ScenarioRenderedElement[];
}) {
  if (!args.frame || args.frame.width < 4 || args.frame.height < 4) {
    args.onSelectSlide();
    return;
  }

  selectFirstElementInMarquee(args.renderedElements, args.frame, args.onSelectElement);
}

function clearMarqueeRefs(
  originRef: MutableRefObject<ScenarioCanvasPoint | null>,
  currentRef: MutableRefObject<ScenarioCanvasPoint | null>
) {
  originRef.current = null;
  currentRef.current = null;
}

function createFinalMarqueeFrame(
  origin: ScenarioCanvasPoint | null,
  current: ScenarioCanvasPoint | null
): ScenarioElementFrame | null {
  return origin && current ? createScenarioCanvasMarqueeFrame(origin, current) : null;
}

function getPointerPoint(
  stageRef: RefObject<HTMLDivElement | null>,
  scale: number,
  event: PointerEvent<HTMLDivElement>
): ScenarioCanvasPoint {
  const stageRect =
    stageRef.current?.getBoundingClientRect() ?? event.currentTarget.getBoundingClientRect();
  return getScenarioCanvasPointFromClient({
    clientX: event.clientX,
    clientY: event.clientY,
    scale,
    stageRect,
  });
}

function selectFirstElementInMarquee(
  elements: readonly ScenarioRenderedElement[],
  frame: ScenarioElementFrame,
  onSelectElement: ScenarioCanvasStageProps['onSelectElement']
) {
  const selected = [...elements]
    .reverse()
    .find((rendered) => doesScenarioFrameIntersect(frame, rendered.box));
  if (selected) {
    onSelectElement(selected.element.id);
  }
}
