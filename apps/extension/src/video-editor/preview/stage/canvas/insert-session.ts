import React from 'react';
import type { CanvasFrame } from '@sniptale/runtime-contracts/canvas-interactions';
import {
  beginPreviewStageCanvasInsertPointer,
  cancelPreviewStageCanvasInsertPointer,
  clearPreviewStageCanvasInsertPointer,
  finishPreviewStageCanvasInsertPointer,
  updatePreviewStageCanvasInsertPointer,
  type VideoPreviewCanvasInsertSession,
} from './insert';
import { handlePreviewStageRootPointerDown } from './layers';
import type { PreviewStageCanvasProps } from '../types';

export type PreviewStageInsertPreviewFrame = CanvasFrame;

type PreviewStageInsertFallbackPointerParams = Parameters<
  typeof handlePreviewStageRootPointerDown
>[1];

export type PreviewStageInsertSessionParams = Pick<
  PreviewStageCanvasProps,
  | 'activeInsertKind'
  | 'camera'
  | 'onAddShapeOverlay'
  | 'onAddTextOverlay'
  | 'onClearActiveInsertKind'
  | 'onSelectClip'
  | 'onUpdateClipTransform'
  | 'project'
  | 'stageRef'
> & {
  fallbackPointerParams: PreviewStageInsertFallbackPointerParams;
};

export function usePreviewStageInsertSession(params: PreviewStageInsertSessionParams) {
  const insertSessionRef = React.useRef<VideoPreviewCanvasInsertSession | null>(null);
  const [insertPreviewFrame, setInsertPreviewFrame] =
    React.useState<PreviewStageInsertPreviewFrame | null>(null);

  useClearPreviewStageInsertWhenInactive({
    activeInsertKind: params.activeInsertKind,
    insertSessionRef,
    setInsertPreviewFrame,
  });

  return {
    insertPointerHandlers: createPreviewStageInsertPointerHandlers({
      insertSessionRef,
      params,
      setInsertPreviewFrame,
    }),
    insertPreviewFrame,
  };
}

function useClearPreviewStageInsertWhenInactive(args: {
  activeInsertKind: PreviewStageInsertSessionParams['activeInsertKind'];
  insertSessionRef: React.RefObject<VideoPreviewCanvasInsertSession | null>;
  setInsertPreviewFrame: (frame: PreviewStageInsertPreviewFrame | null) => void;
}) {
  React.useEffect(() => {
    if (args.activeInsertKind) return;
    clearPreviewStageCanvasInsertPointer({
      insertSessionRef: args.insertSessionRef,
      onPreviewFrameChange: args.setInsertPreviewFrame,
    });
  }, [args.activeInsertKind, args.insertSessionRef, args.setInsertPreviewFrame]);
}

function createPreviewStageInsertPointerHandlers(args: {
  insertSessionRef: React.RefObject<VideoPreviewCanvasInsertSession | null>;
  params: PreviewStageInsertSessionParams;
  setInsertPreviewFrame: (frame: PreviewStageInsertPreviewFrame | null) => void;
}) {
  const { insertSessionRef, params, setInsertPreviewFrame } = args;
  const begin = (event: React.PointerEvent<HTMLDivElement>) =>
    beginPreviewStageCanvasInsertPointer(event, {
      activeInsertKind: params.activeInsertKind,
      camera: params.camera,
      insertSessionRef,
      onPreviewFrameChange: setInsertPreviewFrame,
      project: params.project,
      stageRef: params.stageRef,
    });
  const cancel = () =>
    cancelPreviewStageCanvasInsertPointer({
      insertSessionRef,
      onClearActiveInsertKind: params.onClearActiveInsertKind,
      onPreviewFrameChange: setInsertPreviewFrame,
    });
  return {
    begin,
    cancel,
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      if (insertSessionRef.current || begin(event)) return;
      handlePreviewStageRootPointerDown(event, params.fallbackPointerParams);
    },
    onPointerDownCapture: begin,
    onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== 'Escape' || !params.activeInsertKind) return;
      cancel();
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) =>
      updatePreviewStageCanvasInsertPointer(event, {
        camera: params.camera,
        insertSessionRef,
        onPreviewFrameChange: setInsertPreviewFrame,
        project: params.project,
        stageRef: params.stageRef,
      }),
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) =>
      finishPreviewStageInsertPointer(event, args),
  };
}

function finishPreviewStageInsertPointer(
  event: React.PointerEvent<HTMLDivElement>,
  args: Parameters<typeof createPreviewStageInsertPointerHandlers>[0]
) {
  finishPreviewStageCanvasInsertPointer(event, {
    insertSessionRef: args.insertSessionRef,
    onAddShapeOverlay: args.params.onAddShapeOverlay,
    onAddTextOverlay: args.params.onAddTextOverlay,
    onClearActiveInsertKind: args.params.onClearActiveInsertKind,
    onPreviewFrameChange: args.setInsertPreviewFrame,
    onSelectClip: args.params.onSelectClip,
    onUpdateClipTransform: args.params.onUpdateClipTransform,
    project: args.params.project,
  });
}
