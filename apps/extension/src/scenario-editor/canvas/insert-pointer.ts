import type { MutableRefObject, PointerEvent, RefObject } from 'react';
import {
  beginCanvasToolLifecycle,
  CANVAS_TOOL_MIN_DRAW_SIZE,
  cancelCanvasToolLifecycle,
  createCanvasToolDragPredicate,
  finishCanvasToolLifecycle,
  getCanvasPointFromClient,
  updateCanvasToolLifecycle,
  type CanvasToolLifecycleSession,
  type CanvasToolPointerEventLike,
} from '@sniptale/runtime-contracts/canvas-interactions';
import {
  SCENARIO_V3_ELEMENT_KINDS,
  type ScenarioElementFrame,
  type ScenarioPoint,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioCanvasStageProps } from './types';

const shouldCommitScenarioInsertDrag = createCanvasToolDragPredicate<
  NonNullable<ScenarioCanvasStageProps['activeInsertKind']>
>({
  connectorKinds: [SCENARIO_V3_ELEMENT_KINDS.arrow, SCENARIO_V3_ELEMENT_KINDS.line],
});

export type ScenarioCanvasInsertSession = CanvasToolLifecycleSession<
  NonNullable<ScenarioCanvasStageProps['activeInsertKind']>
>;

export function handleScenarioCanvasInsertPointerDown(args: {
  activeInsertKind: ScenarioCanvasStageProps['activeInsertKind'];
  event: PointerEvent<HTMLDivElement>;
  insertSessionRef: MutableRefObject<ScenarioCanvasInsertSession | null>;
  scale: number;
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
  stageRef: RefObject<HTMLDivElement | null>;
}): boolean {
  return beginCanvasToolLifecycle({
    activeKind: args.activeInsertKind,
    captureTarget: args.stageRef.current,
    event: args.event,
    mapPoint: (event) =>
      getPointerPoint(args.stageRef, args.scale, event, args.event.currentTarget),
    onPreviewFrameChange: args.setPreviewFrame,
    sessionRef: args.insertSessionRef,
  });
}

export function updateScenarioCanvasInsertPointer(args: {
  event: PointerEvent<HTMLDivElement>;
  insertSessionRef: MutableRefObject<ScenarioCanvasInsertSession | null>;
  scale: number;
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
  stageRef: RefObject<HTMLDivElement | null>;
}): boolean {
  return updateCanvasToolLifecycle({
    event: args.event,
    mapPoint: (event) =>
      getPointerPoint(args.stageRef, args.scale, event, args.event.currentTarget),
    onPreviewFrameChange: args.setPreviewFrame,
    sessionRef: args.insertSessionRef,
  });
}

export function finishScenarioCanvasInsertPointer(args: {
  event: PointerEvent<HTMLDivElement>;
  insertSessionRef: MutableRefObject<ScenarioCanvasInsertSession | null>;
  onInsertElementAtPoint: ScenarioCanvasStageProps['onInsertElementAtPoint'];
  onInsertElementFromDrag: ScenarioCanvasStageProps['onInsertElementFromDrag'];
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
}): boolean {
  return finishCanvasToolLifecycle({
    event: args.event,
    minDragSize: CANVAS_TOOL_MIN_DRAW_SIZE,
    onCommitClick: (kind, point) => args.onInsertElementAtPoint?.(kind, point),
    onCommitDrag: (kind, origin, current) => args.onInsertElementFromDrag?.(kind, origin, current),
    onPreviewFrameChange: args.setPreviewFrame,
    shouldCommitDrag: shouldCommitScenarioInsertDrag,
    sessionRef: args.insertSessionRef,
  });
}

export function cancelScenarioCanvasInsertPointer(args: {
  insertSessionRef: MutableRefObject<ScenarioCanvasInsertSession | null>;
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
}): void {
  cancelCanvasToolLifecycle({
    onPreviewFrameChange: args.setPreviewFrame,
    sessionRef: args.insertSessionRef,
  });
}

function getPointerPoint(
  stageRef: RefObject<HTMLDivElement | null>,
  scale: number,
  event: CanvasToolPointerEventLike,
  currentTarget: HTMLDivElement
): ScenarioPoint {
  return getCanvasPointFromClient({
    clientX: event.clientX,
    clientY: event.clientY,
    scale,
    stageRect: stageRef.current?.getBoundingClientRect() ?? currentTarget.getBoundingClientRect(),
  });
}
