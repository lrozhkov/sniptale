import type { CSSProperties } from 'react';
import { translate } from '../../platform/i18n';
import { SCENARIO_V3_ELEMENT_KINDS } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioRenderedElement } from '../project/stage-render/slide';
import type { ScenarioCanvasEndpointHandle, ScenarioCanvasEndpointSession } from './types';

const ENDPOINTS: ScenarioCanvasEndpointHandle[] = ['start', 'end'];

function getEndpointStyle(
  rendered: ScenarioRenderedElement,
  handle: ScenarioCanvasEndpointHandle
): CSSProperties {
  const scale =
    rendered.element.frame.width > 0 ? rendered.box.width / rendered.element.frame.width : 1;

  if (
    rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.arrow &&
    rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.line
  ) {
    return {};
  }

  const point = handle === 'start' ? rendered.element.start : rendered.element.end;
  return {
    left: point.x * scale,
    top: point.y * scale,
    transform: 'translate(-50%, -50%)',
  };
}

export function ScenarioCanvasEndpointHandles(props: {
  renderedElement: ScenarioRenderedElement | null;
  onEndpointStart: (session: ScenarioCanvasEndpointSession, event: React.PointerEvent) => void;
  viewportScale: number;
}) {
  const rendered = props.renderedElement;
  if (
    !rendered ||
    rendered.element.locked ||
    (rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.arrow &&
      rendered.kind !== SCENARIO_V3_ELEMENT_KINDS.line)
  ) {
    return null;
  }

  return (
    <>
      {ENDPOINTS.map((handle) => (
        <ScenarioCanvasEndpointHandleButton
          key={handle}
          handle={handle}
          onEndpointStart={props.onEndpointStart}
          rendered={rendered}
          viewportScale={props.viewportScale}
        />
      ))}
    </>
  );
}

function ScenarioCanvasEndpointHandleButton(props: {
  handle: ScenarioCanvasEndpointHandle;
  rendered: ScenarioRenderedElement;
  onEndpointStart: (session: ScenarioCanvasEndpointSession, event: React.PointerEvent) => void;
  viewportScale: number;
}) {
  return (
    <button
      type="button"
      aria-label={translate(
        props.handle === 'start'
          ? 'scenario.editor.moveStartEndpoint'
          : 'scenario.editor.moveEndEndpoint'
      )}
      data-ui="scenario.canvas.endpoint-handle"
      onPointerDown={(event) => {
        event.stopPropagation();
        props.onEndpointStart(
          {
            element: props.rendered.element,
            handle: props.handle,
            originClientX: event.clientX,
            originClientY: event.clientY,
          },
          event
        );
      }}
      className="absolute z-20 h-4 w-4 rounded-full border border-[var(--sniptale-color-border-accent-strong)]
        bg-[var(--sniptale-color-surface-panel)] shadow-[0_4px_12px_rgba(15,23,42,0.22)]"
      style={{
        ...getEndpointStyle(props.rendered, props.handle),
        height: 16 / props.viewportScale,
        width: 16 / props.viewportScale,
      }}
    />
  );
}
