import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ScenarioRect } from '@sniptale/runtime-contracts/scenario/types/geometry';
import type { ScenarioCaptureStep } from '../../../features/scenario/contracts/types/project';
import type { ScenarioQuickEditDragState } from './stage.types';
import { QUICK_EDIT_ACCENT, QUICK_EDIT_HANDLE_FILL } from './theme';

function Handle(props: {
  left: number;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  top: number;
}) {
  return (
    <button
      type="button"
      onPointerDown={props.onPointerDown}
      className="pointer-events-auto absolute h-3.5 w-3.5 rounded-full border-2 shadow-sm"
      style={{
        left: props.left - 7,
        top: props.top - 7,
        borderColor: QUICK_EDIT_ACCENT,
        background: QUICK_EDIT_HANDLE_FILL,
      }}
    />
  );
}

export function ArrowMoveHandle(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  center: { x: number; y: number };
  onSelectOverlay: (overlayId: string | null) => void;
  overlayId: string;
  step: ScenarioCaptureStep;
}) {
  return (
    <button
      type="button"
      className="pointer-events-auto absolute h-4 w-4 rounded-full border-2 shadow-sm"
      style={{
        left: props.center.x - 8,
        top: props.center.y - 8,
        borderColor: QUICK_EDIT_ACCENT,
        background: QUICK_EDIT_HANDLE_FILL,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onSelectOverlay(props.overlayId);
        props.beginDrag({
          kind: 'move-overlay',
          origin: { x: event.clientX, y: event.clientY },
          overlayId: props.overlayId,
          snapshot: props.step,
        });
      }}
    />
  );
}

export function ArrowEndpointHandles(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  end: { x: number; y: number };
  overlayId: string;
  start: { x: number; y: number };
  step: ScenarioCaptureStep;
}) {
  return (
    <>
      <Handle
        left={props.start.x}
        top={props.start.y}
        onPointerDown={(event) => {
          event.stopPropagation();
          props.beginDrag({
            kind: 'move-arrow-endpoint',
            endpoint: 'start',
            origin: { x: event.clientX, y: event.clientY },
            overlayId: props.overlayId,
            snapshot: props.step,
          });
        }}
      />
      <Handle
        left={props.end.x}
        top={props.end.y}
        onPointerDown={(event) => {
          event.stopPropagation();
          props.beginDrag({
            kind: 'move-arrow-endpoint',
            endpoint: 'end',
            origin: { x: event.clientX, y: event.clientY },
            overlayId: props.overlayId,
            snapshot: props.step,
          });
        }}
      />
    </>
  );
}

export function RectResizeHandles(props: {
  beginDrag: (state: ScenarioQuickEditDragState) => void;
  overlayId: string;
  rect: ScenarioRect;
  step: ScenarioCaptureStep;
}) {
  return (['nw', 'ne', 'sw', 'se'] as const).map((handle) => (
    <Handle
      key={handle}
      left={handle.includes('w') ? props.rect.x : props.rect.x + props.rect.width}
      top={handle.includes('n') ? props.rect.y : props.rect.y + props.rect.height}
      onPointerDown={(event) => {
        event.stopPropagation();
        props.beginDrag({
          kind: 'resize-overlay',
          handle,
          origin: { x: event.clientX, y: event.clientY },
          overlayId: props.overlayId,
          snapshot: props.step,
        });
      }}
    />
  ));
}
