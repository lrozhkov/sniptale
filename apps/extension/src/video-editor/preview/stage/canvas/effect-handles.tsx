import { useEffect, useRef, type PointerEvent } from 'react';
import { getEffectClipObjectLayout } from '../../../../features/video/project/effect-instance/layout';
import { getCurrentLocale } from '../../../../platform/i18n';
import {
  getCompositionRectStageStyle,
  mapClientPointToCompositionPoint,
  shouldLockPreviewClipToViewport,
} from './geometry';
import type { PreviewStageCanvasProps } from '../types';

type Props = Pick<
  PreviewStageCanvasProps,
  | 'project'
  | 'selectedClip'
  | 'selectedClipLocked'
  | 'camera'
  | 'stageRef'
  | 'onUpdateEffectInstance'
  | 'onPreviewEffectAnchors'
>;

export function PreviewEffectHandles(props: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [props.selectedClip?.id]);
  const clip = props.selectedClip;
  const stage = props.stageRef.current;
  if (
    !clip ||
    clip.type !== 'EFFECT' ||
    props.selectedClipLocked ||
    !stage ||
    !props.onUpdateEffectInstance
  )
    return null;
  const instance = props.project.effectInstances?.find((item) => item.id === clip.effectInstanceId);
  const layout = getEffectClipObjectLayout(props.project, clip);
  if (!instance?.sceneAnchors || !layout?.handles) return null;
  const lockToViewport = shouldLockPreviewClipToViewport(clip, props.camera, props.project);
  return (
    <>
      {layout.handles.map((handle) => {
        const anchor = instance.sceneAnchors?.[handle.id];
        if (!anchor) return null;
        const style = getCompositionRectStageStyle(
          props.project,
          { ...clip.transform, ...anchor, width: 0, height: 0 },
          props.camera,
          lockToViewport,
          stage
        );
        const label =
          handle.label[getCurrentLocale()] ?? handle.label.en ?? handle.label.ru ?? handle.id;
        return (
          <button
            key={handle.id}
            type="button"
            aria-label={label}
            title={label}
            data-effect-handle={handle.id}
            data-video-editor-local-navigation="true"
            className={[
              'pointer-events-auto absolute z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2',
              'cursor-move rounded-full border-2 border-[var(--sniptale-color-accent-emphasis)]',
              'bg-[var(--sniptale-color-surface-panel)]',
            ].join(' ')}
            style={{ left: style.left, top: style.top }}
            onPointerDown={(event) => {
              cleanup.current?.();
              cleanup.current = beginHandleDrag(
                event,
                props,
                instance.id,
                handle.id,
                instance.sceneAnchors!,
                lockToViewport
              );
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              const delta = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              }[event.key];
              if (!delta) return;
              event.preventDefault();
              event.stopPropagation();
              const step = event.shiftKey ? 10 : 1;
              props.onUpdateEffectInstance?.(instance.id, {
                sceneAnchors: {
                  ...instance.sceneAnchors,
                  [handle.id]: {
                    x: Math.max(0, Math.min(props.project.width, anchor.x + delta[0]! * step)),
                    y: Math.max(0, Math.min(props.project.height, anchor.y + delta[1]! * step)),
                  },
                },
              });
            }}
          />
        );
      })}
    </>
  );
}

function beginHandleDrag(
  event: PointerEvent<HTMLButtonElement>,
  props: Props,
  instanceId: string,
  handleId: string,
  anchors: Record<string, { x: number; y: number }>,
  lockToViewport: boolean
): () => void {
  event.preventDefault();
  event.stopPropagation();
  const button = event.currentTarget;
  const pointerId = event.pointerId;
  button.setPointerCapture(pointerId);
  let next = anchors;
  let finished = false;
  let changed = false;
  const move = (pointer: globalThis.PointerEvent) => {
    if (pointer.pointerId !== pointerId || !props.stageRef.current) return;
    const point = mapClientPointToCompositionPoint({
      camera: props.camera,
      clientX: pointer.clientX,
      clientY: pointer.clientY,
      lockToViewport,
      project: props.project,
      stage: props.stageRef.current,
    });
    if (!point) return;
    next = {
      ...anchors,
      [handleId]: {
        x: Math.max(0, Math.min(props.project.width, point.x)),
        y: Math.max(0, Math.min(props.project.height, point.y)),
      },
    };
    changed = true;
    props.onPreviewEffectAnchors?.(instanceId, next);
  };
  const finish = (commit: boolean) => {
    if (finished) return;
    finished = true;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('keydown', key, true);
    if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
    if (commit && changed) props.onUpdateEffectInstance?.(instanceId, { sceneAnchors: next });
    props.onPreviewEffectAnchors?.(instanceId, null);
  };
  const up = (pointer: globalThis.PointerEvent) => {
    if (pointer.pointerId === pointerId) {
      if (changed) move(pointer);
      finish(true);
    }
  };
  const cancel = () => finish(false);
  const key = (keyboard: KeyboardEvent) => {
    if (keyboard.key === 'Escape') {
      keyboard.preventDefault();
      keyboard.stopPropagation();
      finish(false);
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('keydown', key, true);
  return cancel;
}
