import type { CSSProperties } from 'react';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioCanvasResizeHandle, ScenarioCanvasResizeSession } from './types';

const HANDLES: ScenarioCanvasResizeHandle[] = ['nw', 'ne', 'sw', 'se'];

function getHandleStyle(
  rendered: ScenarioRenderedElement,
  handle: ScenarioCanvasResizeHandle
): CSSProperties {
  const left = handle.includes('w') ? rendered.box.x : rendered.box.x + rendered.box.width;
  const top = handle.includes('n') ? rendered.box.y : rendered.box.y + rendered.box.height;

  return {
    left,
    top,
    transform: 'translate(-50%, -50%)',
  };
}

export function ScenarioCanvasResizeHandles(props: {
  renderedElement: ScenarioRenderedElement | null;
  onResizeStart: (session: ScenarioCanvasResizeSession, event: React.PointerEvent) => void;
  viewportScale: number;
}) {
  if (!props.renderedElement || props.renderedElement.element.locked) {
    return null;
  }

  const renderedElement = props.renderedElement;

  return (
    <>
      {HANDLES.map((handle) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize ${handle}`}
          data-ui="scenario.canvas.resize-handle"
          onPointerDown={(event) => {
            event.stopPropagation();
            props.onResizeStart(
              {
                element: renderedElement.element,
                handle,
                originClientX: event.clientX,
                originClientY: event.clientY,
              },
              event
            );
          }}
          className="absolute z-10 h-3 w-3 rounded-full border border-[var(--sniptale-color-border-accent-strong)]
            bg-[var(--sniptale-color-surface-panel)] shadow-[0_4px_12px_rgba(15,23,42,0.22)]
            focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
            focus-visible:outline-[var(--sniptale-color-border-accent-strong)]"
          style={{
            ...getHandleStyle(renderedElement, handle),
            height: 12 / props.viewportScale,
            width: 12 / props.viewportScale,
          }}
        />
      ))}
    </>
  );
}
