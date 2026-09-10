import { useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import { resolveEffectLocaleText } from '@sniptale/runtime-contracts/effect-v1';
import { getCurrentLocale, translate } from '../../../../../platform/i18n';
import type { PreviewStageCanvasProps } from '../../types';
import {
  getCompositionRectStageStyle,
  mapClientPointToCompositionPoint,
  shouldLockPreviewClipToViewport,
} from '../geometry';
import {
  getPreviewTransformResizeCursor,
  type PreviewTransformResizeHandle,
} from '../transform/geometry';
import {
  mapRegionPoint,
  resolveEditorRegionModel,
  resizeEditorRegion,
  type EditorRegionModel,
} from './model';
import { beginEditorRegionGesture } from './gesture';

type Props = Pick<
  PreviewStageCanvasProps,
  | 'project'
  | 'selectedEffectInstanceId'
  | 'currentTime'
  | 'camera'
  | 'stageRef'
  | 'onUpdateEffectInstance'
  | 'onPreviewEffectControls'
>;

export function PreviewEffectEditorRegion(props: Props) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), [props.selectedEffectInstanceId]);
  const stage = props.stageRef.current;
  const model = props.selectedEffectInstanceId
    ? resolveEditorRegionModel(props.project, props.selectedEffectInstanceId, props.currentTime)
    : null;
  if (!stage || !model || !props.onUpdateEffectInstance) return null;
  return <EditorRegionFrame {...props} model={model} stage={stage} cleanup={cleanup} />;
}

function EditorRegionFrame(
  props: Props & {
    model: EditorRegionModel;
    stage: HTMLDivElement;
    cleanup: RefObject<(() => void) | null>;
  }
) {
  const { model, stage, cleanup } = props;
  const lockedToViewport = model.clip
    ? shouldLockPreviewClipToViewport(model.clip, props.camera, props.project)
    : true;
  const center = mapRegionPoint(model, {
    x: model.rect.x + model.rect.width / 2,
    y: model.rect.y + model.rect.height / 2,
  });
  const style = getCompositionRectStageStyle(
    props.project,
    {
      ...model.rect,
      x: center.x - model.rect.width / 2,
      y: center.y - model.rect.height / 2,
    },
    props.camera,
    lockedToViewport,
    stage
  );
  const label = resolveEffectLocaleText(model.document.editorRegion!.label, getCurrentLocale());
  const commit = (controls: Record<string, number>) =>
    props.onUpdateEffectInstance?.(model.instance.id, { controls });
  const begin = (event: PointerEvent, mode: 'move' | PreviewTransformResizeHandle) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    cleanup.current?.();
    const mapPoint = (pointer: { clientX: number; clientY: number }) => {
      const point = mapClientPointToCompositionPoint({
        project: props.project,
        stage,
        camera: props.camera,
        clientX: pointer.clientX,
        clientY: pointer.clientY,
        lockToViewport: lockedToViewport,
      });
      return point ? mapRegionPoint(model, point, true) : null;
    };
    const origin = mapPoint(event);
    if (!origin) return;
    cleanup.current = beginEditorRegionGesture({
      model,
      mode,
      origin,
      pointerId: event.pointerId,
      mapPoint,
      preview: (controls) => props.onPreviewEffectControls?.(model.instance.id, controls),
      commit,
    });
  };
  return (
    <div
      data-effect-editor-region={model.instance.id}
      className="pointer-events-none absolute z-30 border border-dashed border-[var(--sniptale-color-accent-emphasis)]"
      style={{
        ...style,
        transform: `rotate(${model.placement.rotation}deg)`,
        transformOrigin: 'center',
      }}
    >
      <button
        type="button"
        aria-label={label}
        title={label}
        data-video-editor-local-navigation="true"
        className="pointer-events-auto absolute inset-0 cursor-grab bg-transparent focus-visible:outline"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => begin(event, 'move')}
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
          commit(resizeEditorRegion(model, 'move', delta[0]! * step, delta[1]! * step));
        }}
      />
      {(['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`${label}: ${translate(
            (
              {
                nw: 'videoEditor.effectsLibrary.resizeRegionTopLeft',
                ne: 'videoEditor.effectsLibrary.resizeRegionTopRight',
                sw: 'videoEditor.effectsLibrary.resizeRegionBottomLeft',
                se: 'videoEditor.effectsLibrary.resizeRegionBottomRight',
              } as const
            )[handle]
          )}`}
          data-effect-region-handle={handle}
          className="pointer-events-auto absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            left: handle.includes('e') ? '100%' : '0%',
            top: handle.includes('s') ? '100%' : '0%',
            background: 'var(--sniptale-color-surface-panel)',
            borderColor: 'var(--sniptale-color-accent-emphasis)',
            cursor: getPreviewTransformResizeCursor(handle, model.placement.rotation),
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => begin(event, handle)}
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
            commit(resizeEditorRegion(model, handle, delta[0]! * step, delta[1]! * step));
          }}
        />
      ))}
    </div>
  );
}
