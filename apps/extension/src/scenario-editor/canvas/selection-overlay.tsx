import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioCanvasDragSession } from './types';

function getOverlayClass(selected: boolean, locked: boolean): string {
  const cursorClass = locked ? 'cursor-not-allowed' : 'cursor-move';
  const borderClass = selected
    ? 'border-[var(--sniptale-color-border-accent-strong)]'
    : 'border-transparent hover:border-[var(--sniptale-color-border-soft)]';

  return `absolute border ${borderClass} ${cursorClass} bg-transparent outline-none
    focus-visible:border-[var(--sniptale-color-border-accent-strong)]
    focus-visible:ring-2 focus-visible:ring-[var(--sniptale-color-border-accent-strong)]`;
}

export function ScenarioCanvasSelectionOverlay(props: {
  elements: ScenarioRenderedElement[];
  onDragStart: (session: ScenarioCanvasDragSession, event: React.PointerEvent) => void;
  onSelectElement: (elementId: string) => void;
}) {
  return (
    <>
      {props.elements.map((rendered) => (
        <button
          key={rendered.element.id}
          type="button"
          aria-label={rendered.element.name}
          data-ui="scenario.canvas.element-overlay"
          data-element-id={rendered.element.id}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) {
              props.onSelectElement(rendered.element.id);
            }
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
            props.onSelectElement(rendered.element.id);
            if (!rendered.element.locked) {
              props.onDragStart(
                {
                  element: rendered.element,
                  originClientX: event.clientX,
                  originClientY: event.clientY,
                },
                event
              );
            }
          }}
          className={getOverlayClass(rendered.selected, rendered.element.locked)}
          style={{
            height: rendered.box.height,
            left: rendered.box.x,
            top: rendered.box.y,
            width: rendered.box.width,
          }}
        />
      ))}
    </>
  );
}
