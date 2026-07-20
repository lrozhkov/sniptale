import type React from 'react';
import {
  beginCanvasToolLifecycle,
  CANVAS_TOOL_MIN_DRAW_SIZE,
  cancelCanvasToolLifecycle,
  createCanvasToolDragPredicate,
  finishCanvasToolLifecycle,
  updateCanvasToolLifecycle,
  type CanvasFrame,
  type CanvasToolLifecycleSession,
} from '@sniptale/runtime-contracts/canvas-interactions';
import {
  type VideoProjectClip,
  VideoProjectShapeType,
} from '../../../../features/video/project/types/index';
import { mapClientPointToCompositionPoint } from './geometry';
import {
  createVideoPreviewClickInsertTransform,
  createVideoPreviewDragInsertTransform,
  normalizeVideoPreviewInsertFrame,
} from './insert-geometry';
import type { PreviewStageCanvasProps, VideoPreviewCanvasInsertKind } from '../types';

const MIN_INSERT_DRAG_SIZE = CANVAS_TOOL_MIN_DRAW_SIZE;
const shouldCommitVideoInsertDrag = createCanvasToolDragPredicate<VideoPreviewCanvasInsertKind>({
  connectorKinds: ['arrow', 'line'],
});

export type VideoPreviewCanvasInsertSession =
  CanvasToolLifecycleSession<VideoPreviewCanvasInsertKind>;

function insertVideoPreviewClip(
  kind: VideoPreviewCanvasInsertKind,
  params: Pick<PreviewStageCanvasProps, 'onAddShapeOverlay' | 'onAddTextOverlay'>
) {
  switch (kind) {
    case 'arrow':
      return params.onAddShapeOverlay(VideoProjectShapeType.ARROW);
    case 'line':
      return params.onAddShapeOverlay(VideoProjectShapeType.LINE);
    case 'shape':
      return params.onAddShapeOverlay(VideoProjectShapeType.RECTANGLE);
    case 'text':
      return params.onAddTextOverlay();
  }
}

export function beginPreviewStageCanvasInsertPointer(
  event: React.PointerEvent<HTMLDivElement>,
  params: Pick<PreviewStageCanvasProps, 'activeInsertKind' | 'camera' | 'project' | 'stageRef'> & {
    insertSessionRef: React.MutableRefObject<VideoPreviewCanvasInsertSession | null>;
    onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  }
): boolean {
  if (!params.activeInsertKind || !params.stageRef.current) {
    return false;
  }

  return beginCanvasToolLifecycle({
    activeKind: params.activeInsertKind,
    captureTarget: params.stageRef.current,
    event,
    mapPoint: (pointerEvent) =>
      mapPreviewInsertPoint({
        camera: params.camera,
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        project: params.project,
        stage: params.stageRef.current,
      }),
    onPreviewFrameChange: params.onPreviewFrameChange,
    sessionRef: params.insertSessionRef,
  });
}

export function updatePreviewStageCanvasInsertPointer(
  event: React.PointerEvent<HTMLDivElement>,
  params: Pick<PreviewStageCanvasProps, 'camera' | 'project' | 'stageRef'> & {
    insertSessionRef: React.MutableRefObject<VideoPreviewCanvasInsertSession | null>;
    onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  }
): boolean {
  if (!params.stageRef.current) {
    return false;
  }

  return updateCanvasToolLifecycle({
    event,
    mapPoint: (pointerEvent) =>
      mapPreviewInsertPoint({
        camera: params.camera,
        clientX: pointerEvent.clientX,
        clientY: pointerEvent.clientY,
        project: params.project,
        stage: params.stageRef.current,
      }),
    normalizeFrame: (frame) =>
      normalizeVideoPreviewInsertFrame({
        frame,
        kind: params.insertSessionRef.current?.kind ?? null,
        project: params.project,
      }),
    onPreviewFrameChange: params.onPreviewFrameChange,
    sessionRef: params.insertSessionRef,
  });
}

export function finishPreviewStageCanvasInsertPointer(
  event: React.PointerEvent<HTMLDivElement>,
  params: Pick<
    PreviewStageCanvasProps,
    | 'onAddShapeOverlay'
    | 'onAddTextOverlay'
    | 'onClearActiveInsertKind'
    | 'onSelectClip'
    | 'onUpdateClipTransform'
    | 'project'
  > & {
    insertSessionRef: React.MutableRefObject<VideoPreviewCanvasInsertSession | null>;
    onPreviewFrameChange: (frame: CanvasFrame | null) => void;
  }
): boolean {
  return finishCanvasToolLifecycle({
    event,
    minDragSize: MIN_INSERT_DRAG_SIZE,
    onCommitClick: (kind, point) => {
      insertVideoPreviewClipAtFrame({
        frame: createVideoPreviewClickInsertTransform({ kind, point, project: params.project }),
        kind,
        params,
      });
    },
    onCommitDrag: (kind, origin, current) => {
      insertVideoPreviewClipAtFrame({
        frame: createVideoPreviewDragInsertTransform({
          current,
          kind,
          origin,
          project: params.project,
        }),
        kind,
        params,
      });
    },
    onPreviewFrameChange: params.onPreviewFrameChange,
    shouldCommitDrag: shouldCommitVideoInsertDrag,
    sessionRef: params.insertSessionRef,
  });
}

export function cancelPreviewStageCanvasInsertPointer(params: {
  insertSessionRef: React.MutableRefObject<VideoPreviewCanvasInsertSession | null>;
  onClearActiveInsertKind: () => void;
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
}): void {
  clearPreviewStageCanvasInsertPointer(params);
  params.onClearActiveInsertKind();
}

export function clearPreviewStageCanvasInsertPointer(params: {
  insertSessionRef: React.MutableRefObject<VideoPreviewCanvasInsertSession | null>;
  onPreviewFrameChange: (frame: CanvasFrame | null) => void;
}): void {
  cancelCanvasToolLifecycle({
    onPreviewFrameChange: params.onPreviewFrameChange,
    sessionRef: params.insertSessionRef,
  });
}

function insertVideoPreviewClipAtFrame(args: {
  frame: Partial<VideoProjectClip['transform']>;
  kind: VideoPreviewCanvasInsertKind;
  params: Pick<
    PreviewStageCanvasProps,
    | 'onAddShapeOverlay'
    | 'onAddTextOverlay'
    | 'onClearActiveInsertKind'
    | 'onSelectClip'
    | 'onUpdateClipTransform'
  >;
}) {
  const clipId = insertVideoPreviewClip(args.kind, args.params);
  if (!clipId) {
    args.params.onClearActiveInsertKind();
    return;
  }

  args.params.onUpdateClipTransform(
    clipId,
    args.frame satisfies Partial<VideoProjectClip['transform']>
  );
  args.params.onSelectClip(clipId);
  args.params.onClearActiveInsertKind();
}

function mapPreviewInsertPoint(args: {
  camera: PreviewStageCanvasProps['camera'];
  clientX: number;
  clientY: number;
  project: PreviewStageCanvasProps['project'];
  stage: HTMLDivElement | null;
}) {
  if (!args.stage) {
    return null;
  }

  return mapClientPointToCompositionPoint({
    camera: args.camera,
    clientX: args.clientX,
    clientY: args.clientY,
    lockToViewport: true,
    project: args.project,
    stage: args.stage,
  });
}
