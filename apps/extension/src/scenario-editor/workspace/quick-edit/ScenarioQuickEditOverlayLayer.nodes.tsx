import type { PointerEvent as ReactPointerEvent } from 'react';
import type { resolveScenarioStageLayout } from '../../../features/scenario/stage/layout';
import type { ScenarioRect } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import { isRectOverlay, projectSourcePoint, projectSourceRect } from './stage.helpers';
import type { ScenarioQuickEditDragState } from './stage.types';
import { QUICK_EDIT_ACCENT, QUICK_EDIT_ACCENT_SOFT } from './theme';
import {
  ArrowEndpointHandles,
  ArrowMoveHandle,
  RectResizeHandles,
} from './ScenarioQuickEditOverlayLayer.handles';

type OverlayMoveDragArgs = {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  onSelectOverlay: (overlayId: string | null) => void;
  overlayId: string;
  step: ScenarioCaptureStep;
};

function createOverlayMoveDragHandler(args: OverlayMoveDragArgs) {
  return (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    args.onSelectOverlay(args.overlayId);
    args.beginDrag({
      kind: 'move-overlay',
      origin: { x: event.clientX, y: event.clientY },
      overlayId: args.overlayId,
      snapshot: args.step,
    });
  };
}

export function ArrowOverlayNode(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  overlay: Extract<ScenarioCaptureStep['overlays'][number], { kind: 'arrow' }>;
  onSelectOverlay: (overlayId: string | null) => void;
  selected: boolean;
  step: ScenarioCaptureStep;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
}) {
  const start = projectSourcePoint(props.layout, props.overlay.start);
  const end = projectSourcePoint(props.layout, props.overlay.end);
  const center = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

  return (
    <div className="absolute inset-0">
      <svg className="pointer-events-none absolute inset-0 overflow-visible">
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={props.overlay.color}
          strokeWidth={props.overlay.strokeWidth}
        />
      </svg>
      <ArrowMoveHandle
        beginDrag={props.beginDrag}
        center={center}
        onSelectOverlay={props.onSelectOverlay}
        overlayId={props.overlay.id}
        step={props.step}
      />
      {props.selected ? (
        <ArrowEndpointHandles
          beginDrag={props.beginDrag}
          end={end}
          overlayId={props.overlay.id}
          start={start}
          step={props.step}
        />
      ) : null}
    </div>
  );
}

export function RectOverlayNode(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  overlay: Extract<ScenarioCaptureStep['overlays'][number], { rect: ScenarioRect }>;
  onSelectOverlay: (overlayId: string | null) => void;
  selected: boolean;
  step: ScenarioCaptureStep;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
}) {
  const rect = projectSourceRect(props.layout, props.overlay.rect);
  const handlePointerDown = createOverlayMoveDragHandler({
    beginDrag: props.beginDrag,
    onSelectOverlay: props.onSelectOverlay,
    overlayId: props.overlay.id,
    step: props.step,
  });

  return (
    <div
      className="pointer-events-auto absolute rounded-[12px] border-2"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        borderColor: props.selected ? QUICK_EDIT_ACCENT : 'rgba(255,255,255,0.88)',
        background: props.selected ? QUICK_EDIT_ACCENT_SOFT : 'rgba(255,255,255,0.08)',
      }}
      onPointerDown={handlePointerDown}
    >
      {props.selected ? (
        <RectResizeHandles
          beginDrag={props.beginDrag}
          overlayId={props.overlay.id}
          rect={rect}
          step={props.step}
        />
      ) : null}
    </div>
  );
}

export function PointOverlayNode(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  overlay: Extract<
    ScenarioCaptureStep['overlays'][number],
    { kind: 'click-ring' | 'cursor' | 'text' }
  >;
  onSelectOverlay: (overlayId: string | null) => void;
  selected: boolean;
  step: ScenarioCaptureStep;
  layout: NonNullable<ReturnType<typeof resolveScenarioStageLayout>>;
}) {
  const point = projectSourcePoint(props.layout, props.overlay.point);
  const handlePointerDown = createOverlayMoveDragHandler({
    beginDrag: props.beginDrag,
    onSelectOverlay: props.onSelectOverlay,
    overlayId: props.overlay.id,
    step: props.step,
  });

  return (
    <button
      type="button"
      className="pointer-events-auto absolute rounded-full border-2 shadow-sm"
      style={{
        left: point.x - 10,
        top: point.y - 10,
        width: props.overlay.kind === 'text' ? 24 : 20,
        height: props.overlay.kind === 'text' ? 24 : 20,
        borderColor: props.selected ? QUICK_EDIT_ACCENT : 'white',
        background: props.selected ? QUICK_EDIT_ACCENT : 'rgba(17,24,39,0.72)',
      }}
      onPointerDown={handlePointerDown}
    />
  );
}

export function isRectNavigatorOverlay(
  overlay: ScenarioCaptureStep['overlays'][number]
): overlay is Extract<ScenarioCaptureStep['overlays'][number], { rect: ScenarioRect }> {
  return isRectOverlay(overlay);
}
