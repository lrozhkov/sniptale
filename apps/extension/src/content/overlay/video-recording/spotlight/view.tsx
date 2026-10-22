import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DEFAULT_VIDEO_CURSOR_EFFECTS,
  type VideoCursorEffectSettings,
} from '@sniptale/runtime-contracts/video/types/types';

type SpotlightClick = { x: number; y: number; key: number } | null;
const CLICK_DRAG_THRESHOLD_CSS_PX = 4;

function dimmingMask(radius: number) {
  const center =
    'var(--sniptale-recording-cursor-x, -1000px) var(--sniptale-recording-cursor-y, -1000px)';
  const innerRadius = (radius * 38) / 54;
  return `radial-gradient(circle ${radius}px at ${center}, transparent 0 ${innerRadius}px, black ${radius}px)`;
}

function clickAppearance(effects: VideoCursorEffectSettings): CSSProperties {
  const effect = effects.clickEffect ?? 'ripple';
  const color = effects.clickColor ?? 'var(--sniptale-color-accent)';
  const pulses = effects.clickPulses ?? 1;
  return {
    width: effects.clickSize,
    height: effects.clickSize,
    border: effect === 'ripple' ? `${effects.clickStroke ?? 2}px solid ${color}` : 'none',
    background: effect === 'ripple' ? 'transparent' : color,
    boxShadow: effect === 'glow' ? `0 0 ${effects.clickSize / 2}px ${color}` : 'none',
    borderRadius: '999px',
    transform: 'translate(-50%, -50%)',
    animation: [
      `sniptale-recording-click-${effect === 'ripple' ? 'ripple' : 'press'}`,
      `${effects.clickDuration / pulses}ms`,
      effects.clickEasing ?? 'ease-out',
      pulses,
      'forwards',
    ].join(' '),
  };
}

function readSelection() {
  const selection = document.getSelection();
  return selection && !selection.isCollapsed
    ? ([
        selection.anchorNode,
        selection.anchorOffset,
        selection.focusNode,
        selection.focusOffset,
      ] as const)
    : null;
}

function subscribeClickFeedback(onClick: (event: MouseEvent) => void) {
  let gesture: {
    pointerId: number;
    x: number;
    y: number;
    selection: ReturnType<typeof readSelection>;
    suppressed: boolean;
    released: boolean;
  } | null = null;
  const down = (event: PointerEvent) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    gesture = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      selection: readSelection(),
      suppressed: false,
      released: false,
    };
  };
  const move = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.released) return;
    if (
      Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > CLICK_DRAG_THRESHOLD_CSS_PX
    )
      gesture.suppressed = true;
  };
  const up = (event: PointerEvent) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    move(event);
    gesture.released = true;
  };
  const cancel = () => {
    if (gesture) gesture.suppressed = true;
  };
  const blur = (event: FocusEvent) => {
    if (event.target === event.currentTarget) cancel();
  };
  const click = (event: MouseEvent) => {
    const completed = gesture;
    gesture = null;
    if (event.detail > 0 && completed) {
      const selection = readSelection();
      const selected =
        event.detail === 1 &&
        selection !== null &&
        !selection.every((value, index) => value === completed.selection?.[index]);
      if (completed.suppressed || !completed.released || selected) return;
    }
    onClick(event);
  };
  document.addEventListener('pointerdown', down, true);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('dragstart', cancel, true);
  document.addEventListener('click', click, true);
  window.addEventListener('blur', blur, true);
  return () => {
    document.removeEventListener('pointerdown', down, true);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('dragstart', cancel, true);
    document.removeEventListener('click', click, true);
    window.removeEventListener('blur', blur, true);
  };
}

export function VideoRecordingSpotlight(props: {
  cursorHaloEnabled: boolean;
  cursorDimmingEnabled: boolean;
  clickAnimationEnabled: boolean;
  cursorEffects?: VideoCursorEffectSettings;
}) {
  const effects = props.cursorEffects ?? DEFAULT_VIDEO_CURSOR_EFFECTS;
  const haloColor = effects.haloColor ?? 'var(--sniptale-color-accent)';
  const [clickPoint, setClickPoint] = useState<SpotlightClick>(null);
  const haloRef = useRef<HTMLDivElement>(null);
  const dimmingRef = useRef<HTMLDivElement>(null);
  const active =
    props.cursorHaloEnabled || props.cursorDimmingEnabled || props.clickAnimationEnabled;
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let x = -100;
    let y = -100;
    const paint = () => {
      frame = 0;
      haloRef.current?.style.setProperty('transform', `translate(${x}px, ${y}px)`);
      dimmingRef.current?.style.setProperty('--sniptale-recording-cursor-x', `${x}px`);
      dimmingRef.current?.style.setProperty('--sniptale-recording-cursor-y', `${y}px`);
    };
    const move = (event: PointerEvent) => {
      x = event.clientX;
      y = event.clientY;
      if (frame === 0) frame = requestAnimationFrame(paint);
    };
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (
        props.clickAnimationEnabled &&
        !(target instanceof Element && target.closest('.sniptale-app'))
      ) {
        setClickPoint({ x: event.clientX, y: event.clientY, key: Date.now() });
      }
    };
    document.addEventListener('pointermove', move, true);
    const stopClickFeedback = props.clickAnimationEnabled ? subscribeClickFeedback(click) : null;
    return () => {
      document.removeEventListener('pointermove', move, true);
      stopClickFeedback?.();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [active, props.clickAnimationEnabled]);
  if (!active) return null;
  return (
    <div
      aria-hidden
      data-ui="content.video-recording.spotlight"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483638, pointerEvents: 'none' }}
    >
      {props.cursorDimmingEnabled ? (
        <div
          ref={dimmingRef}
          data-ui="content.video-recording.spotlight-dimming"
          style={{
            position: 'absolute',
            inset: 0,
            background: effects.dimmingColor ?? 'black',
            opacity: effects.dimmingOpacity / 100,
            maskImage: dimmingMask(effects.dimmingRadius),
            WebkitMaskImage: dimmingMask(effects.dimmingRadius),
          }}
        />
      ) : null}
      {props.cursorHaloEnabled ? (
        <div
          ref={haloRef}
          data-ui="content.video-recording.spotlight-halo"
          style={{
            position: 'absolute',
            left: -effects.haloSize / 2,
            top: -effects.haloSize / 2,
            width: effects.haloSize,
            height: effects.haloSize,
            opacity: effects.haloOpacity / 100,
            border: `${effects.haloStroke ?? 2}px solid ${haloColor}`,
            borderRadius: '999px',
            transform: 'translate(-100px, -100px)',
            boxShadow: `0 0 0 ${effects.haloGlow ?? 8}px color-mix(in srgb, ${haloColor} 20%, transparent)`,
          }}
        />
      ) : null}
      {props.clickAnimationEnabled && clickPoint ? (
        <div
          key={clickPoint.key}
          data-ui="content.video-recording.spotlight-click"
          data-effect={effects.clickEffect ?? 'ripple'}
          onAnimationEnd={() =>
            setClickPoint((current) => (current?.key === clickPoint.key ? null : current))
          }
          style={{
            position: 'absolute',
            left: clickPoint.x,
            top: clickPoint.y,
            ...clickAppearance(effects),
          }}
        />
      ) : null}
    </div>
  );
}
