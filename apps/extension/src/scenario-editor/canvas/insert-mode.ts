import { useEffect, useRef, useState } from 'react';
import type { PointerEvent, RefObject } from 'react';
import type { ScenarioElementFrame } from '@sniptale/runtime-contracts/scenario/types/v3';
import {
  cancelScenarioCanvasInsertPointer,
  finishScenarioCanvasInsertPointer,
  handleScenarioCanvasInsertPointerDown,
  updateScenarioCanvasInsertPointer,
  type ScenarioCanvasInsertSession,
} from './insert-pointer';
import type { ScenarioCanvasStageProps } from './types';

export function useScenarioCanvasInsertMode(args: {
  activeInsertKind: ScenarioCanvasStageProps['activeInsertKind'];
  onInsertElementAtPoint: ScenarioCanvasStageProps['onInsertElementAtPoint'];
  onInsertElementFromDrag: ScenarioCanvasStageProps['onInsertElementFromDrag'];
  onClearActiveInsertKind: ScenarioCanvasStageProps['onClearActiveInsertKind'];
  scale: number;
  stageRef: RefObject<HTMLDivElement | null>;
}) {
  const insertSessionRef = useRef<ScenarioCanvasInsertSession | null>(null);
  const [insertPreviewFrame, setInsertPreviewFrame] = useState<ScenarioElementFrame | null>(null);

  useEffect(() => {
    if (args.activeInsertKind) {
      return;
    }

    cancelScenarioCanvasInsertPointer({
      insertSessionRef,
      setPreviewFrame: setInsertPreviewFrame,
    });
  }, [args.activeInsertKind]);

  return createScenarioCanvasInsertControls({
    args,
    frame: insertPreviewFrame,
    insertSessionRef,
    setPreviewFrame: setInsertPreviewFrame,
  });
}

function createScenarioCanvasInsertControls(params: {
  args: Parameters<typeof useScenarioCanvasInsertMode>[0];
  frame: ScenarioElementFrame | null;
  insertSessionRef: RefObject<ScenarioCanvasInsertSession | null>;
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void;
}) {
  const { args, insertSessionRef, setPreviewFrame } = params;
  return {
    begin: (event: PointerEvent<HTMLDivElement>) =>
      handleScenarioCanvasInsertPointerDown({
        activeInsertKind: args.activeInsertKind,
        event,
        insertSessionRef,
        scale: args.scale,
        setPreviewFrame,
        stageRef: args.stageRef,
      }),
    cancel: () => cancelScenarioCanvasInsert(args, insertSessionRef, setPreviewFrame),
    finish: (event: PointerEvent<HTMLDivElement>) =>
      finishScenarioCanvasInsertPointer({
        event,
        insertSessionRef,
        onInsertElementAtPoint: args.onInsertElementAtPoint,
        onInsertElementFromDrag: args.onInsertElementFromDrag,
        setPreviewFrame,
      }),
    frame: params.frame,
    update: (event: PointerEvent<HTMLDivElement>) =>
      updateScenarioCanvasInsertPointer({
        event,
        insertSessionRef,
        scale: args.scale,
        setPreviewFrame,
        stageRef: args.stageRef,
      }),
  };
}

function cancelScenarioCanvasInsert(
  args: Parameters<typeof useScenarioCanvasInsertMode>[0],
  insertSessionRef: RefObject<ScenarioCanvasInsertSession | null>,
  setPreviewFrame: (frame: ScenarioElementFrame | null) => void
) {
  cancelScenarioCanvasInsertPointer({ insertSessionRef, setPreviewFrame });
  args.onClearActiveInsertKind?.();
}
