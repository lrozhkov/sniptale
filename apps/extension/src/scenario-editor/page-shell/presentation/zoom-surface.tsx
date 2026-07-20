import { useRef } from 'react';
import type { ReactNode } from 'react';
import type { ScenarioSlideRenderResult } from '../../project/stage-render/slide';
import { ScenarioCanvasZoomControls } from '../../canvas/controls';
import { useScenarioCanvasViewport } from '../../canvas/viewport-state';
import { useScenarioCanvasZoomAnchor } from '../../canvas/viewport-scroll';

export function ScenarioPresentationZoomSurface(props: {
  children: (rendered: ScenarioSlideRenderResult) => ReactNode;
  rendered: ScenarioSlideRenderResult;
}) {
  const viewport = useScenarioCanvasViewport(props.rendered.canvas);
  const scaledFrameRef = useRef<HTMLDivElement>(null);
  useScenarioCanvasZoomAnchor({
    scale: viewport.scale,
    scaledFrameRef,
    viewportRef: viewport.viewportRef,
  });

  return (
    <div
      ref={viewport.viewportRef}
      data-ui="scenario.presentation.zoom-viewport"
      className="relative h-full min-h-0 overflow-auto"
    >
      <div
        className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center rounded-[8px]
          border border-[var(--sniptale-color-border-soft)]
          bg-[color:color-mix(in_srgb,var(--sniptale-color-surface-panel)_94%,transparent)] px-2 py-1
          shadow-[0_12px_32px_rgba(15,23,42,0.14)]"
      >
        <ScenarioCanvasZoomControls {...viewport.controls} />
      </div>
      <ScenarioPresentationScaledFrame
        rendered={props.rendered}
        scale={viewport.scale}
        scaledFrameRef={scaledFrameRef}
      >
        {props.children(props.rendered)}
      </ScenarioPresentationScaledFrame>
    </div>
  );
}

function ScenarioPresentationScaledFrame(props: {
  children: ReactNode;
  rendered: ScenarioSlideRenderResult;
  scale: number;
  scaledFrameRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="grid min-h-full min-w-full place-items-center px-6 pb-6 pt-20"
      style={{
        minHeight: props.rendered.canvas.height * props.scale + 104,
        minWidth: props.rendered.canvas.width * props.scale + 48,
      }}
    >
      <div
        ref={props.scaledFrameRef}
        style={{
          height: props.rendered.canvas.height * props.scale,
          width: props.rendered.canvas.width * props.scale,
        }}
      >
        <div
          style={{
            height: props.rendered.canvas.height,
            transform: `scale(${props.scale})`,
            transformOrigin: 'top left',
            width: props.rendered.canvas.width,
          }}
        >
          {props.children}
        </div>
      </div>
    </div>
  );
}
