import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { ScenarioSlideRenderResult } from '../../project/stage-render/slide';
import type {
  ScenarioBackgroundTransitionKind,
  ScenarioSlideTransitionKind,
} from '@sniptale/runtime-contracts/scenario/types/v3';
import { ScenarioCanvasSvgAdapter } from '../../canvas';

type ScenarioPresentationTransitionKind =
  | ScenarioBackgroundTransitionKind
  | ScenarioSlideTransitionKind;

interface ScenarioRenderedSlideSnapshot {
  backgroundDurationMs: number;
  backgroundTransitionKind: ScenarioBackgroundTransitionKind;
  canvas: ScenarioSlideRenderResult['canvas'];
  durationMs: number;
  key: string;
  slideTransitionKind: ScenarioSlideTransitionKind;
  svg: string;
}

export function ScenarioPresentationSlideFrame(props: {
  children?: ReactNode;
  clickIndex: number;
  rendered: ScenarioSlideRenderResult;
}) {
  const current = useMemo(() => createSlideSnapshot(props.rendered), [props.rendered]);
  const currentRef = useRef(current);
  currentRef.current = current;
  const previousRef = useRef<ScenarioRenderedSlideSnapshot | null>(null);
  const [outgoing, setOutgoing] = useState<ScenarioRenderedSlideSnapshot | null>(null);

  useEffect(() => {
    const currentSnapshot = currentRef.current;
    const previous = previousRef.current;
    previousRef.current = currentSnapshot;
    if (!previous || previous.key === currentSnapshot.key) {
      return undefined;
    }

    setOutgoing(previous);
    const timeout = window.setTimeout(
      () => setOutgoing(null),
      getTransitionDuration(currentSnapshot)
    );
    return () => window.clearTimeout(timeout);
  }, [current.key]);

  return (
    <div
      data-background-transition={current.backgroundTransitionKind}
      data-click-index={props.clickIndex}
      data-slide-transition={current.slideTransitionKind}
      className="relative overflow-hidden rounded-[8px] border border-[var(--sniptale-color-border-soft)]
        bg-[var(--sniptale-color-surface-panel)]"
      style={{ height: current.canvas.height, width: current.canvas.width }}
    >
      <ScenarioTransitionStyles />
      {outgoing ? <SlideLayer snapshot={outgoing} exiting /> : null}
      <SlideLayer snapshot={current} />
      {props.children}
    </div>
  );
}

function SlideLayer(props: { exiting?: boolean; snapshot: ScenarioRenderedSlideSnapshot }) {
  return (
    <div
      data-ui={
        props.exiting
          ? 'scenario.presentation.slide-outgoing'
          : 'scenario.presentation.slide-current'
      }
      className="absolute inset-0"
      style={getTransitionStyle(props.snapshot, props.exiting ?? false)}
    >
      <ScenarioCanvasSvgAdapter svg={props.snapshot.svg} />
    </div>
  );
}

function createSlideSnapshot(rendered: ScenarioSlideRenderResult): ScenarioRenderedSlideSnapshot {
  return {
    backgroundDurationMs: rendered.slide.backgroundTransition?.durationMs ?? 180,
    backgroundTransitionKind: rendered.slide.backgroundTransition?.kind ?? 'none',
    canvas: rendered.canvas,
    durationMs: rendered.slide.transition?.durationMs ?? 180,
    key: rendered.slide.id,
    slideTransitionKind: rendered.slide.transition?.kind ?? 'none',
    svg: rendered.svg,
  };
}

function getTransitionStyle(
  snapshot: ScenarioRenderedSlideSnapshot,
  exiting: boolean
): CSSProperties {
  const transitionKind = getEffectiveTransitionKind(snapshot);
  const animationName = getTransitionAnimationName(transitionKind, exiting);
  if (!animationName) {
    return {};
  }

  return {
    animationDuration: `${getTransitionDuration(snapshot)}ms`,
    animationFillMode: 'both',
    animationName,
    animationTimingFunction: 'ease-out',
  };
}

function getTransitionAnimationName(
  kind: ScenarioPresentationTransitionKind,
  exiting: boolean
): string | null {
  switch (kind) {
    case 'convex':
      return exiting ? 'sniptaleScenarioConvexOut' : 'sniptaleScenarioConvexIn';
    case 'fade':
      return exiting ? 'sniptaleScenarioFadeOut' : 'sniptaleScenarioFadeIn';
    case 'slide':
      return exiting ? 'sniptaleScenarioSlideOut' : 'sniptaleScenarioSlideIn';
    case 'zoom':
      return exiting ? 'sniptaleScenarioZoomOut' : 'sniptaleScenarioZoomIn';
    case 'none':
      return null;
  }
}

function getTransitionDuration(snapshot: ScenarioRenderedSlideSnapshot): number {
  const duration =
    snapshot.slideTransitionKind === 'none' ? snapshot.backgroundDurationMs : snapshot.durationMs;
  return Math.max(160, Math.min(520, duration));
}

function getEffectiveTransitionKind(
  snapshot: ScenarioRenderedSlideSnapshot
): ScenarioPresentationTransitionKind {
  return snapshot.slideTransitionKind === 'none'
    ? snapshot.backgroundTransitionKind
    : snapshot.slideTransitionKind;
}

function ScenarioTransitionStyles() {
  return (
    <style>
      {`
        @keyframes sniptaleScenarioFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sniptaleScenarioFadeOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes sniptaleScenarioSlideIn {
          from { opacity: .2; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes sniptaleScenarioSlideOut {
          from { opacity: 1; transform: translateX(0); }
          to { opacity: 0; transform: translateX(-14px); }
        }
        @keyframes sniptaleScenarioZoomIn {
          from { opacity: .2; transform: scale(.985); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes sniptaleScenarioZoomOut {
          from { opacity: 1; transform: scale(1); }
          to { opacity: 0; transform: scale(1.012); }
        }
        @keyframes sniptaleScenarioConvexIn {
          from { opacity: .2; transform: perspective(900px) rotateY(5deg); }
          to { opacity: 1; transform: perspective(900px) rotateY(0); }
        }
        @keyframes sniptaleScenarioConvexOut {
          from { opacity: 1; transform: perspective(900px) rotateY(0); }
          to { opacity: 0; transform: perspective(900px) rotateY(-4deg); }
        }
      `}
    </style>
  );
}
