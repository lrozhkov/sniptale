import { useEffect, useRef, useState } from 'react';

type SpotlightClick = { x: number; y: number; key: number } | null;

const INITIAL_DIMMING_MASK =
  'radial-gradient(circle 54px at -100px -100px, transparent 0 38px, black 54px)';

export function VideoRecordingSpotlight(props: {
  cursorHaloEnabled: boolean;
  cursorDimmingEnabled: boolean;
  clickAnimationEnabled: boolean;
}) {
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
      const mask =
        `radial-gradient(circle 54px at ${x}px ${y}px, ` + 'transparent 0 38px, black 54px)';
      dimmingRef.current?.style.setProperty('mask-image', mask);
      dimmingRef.current?.style.setProperty('-webkit-mask-image', mask);
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
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('click', click, true);
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
            background: 'rgba(0,0,0,.34)',
            maskImage: INITIAL_DIMMING_MASK,
            WebkitMaskImage: INITIAL_DIMMING_MASK,
          }}
        />
      ) : null}
      {props.cursorHaloEnabled ? (
        <div
          ref={haloRef}
          data-ui="content.video-recording.spotlight-halo"
          style={{
            position: 'absolute',
            left: -17,
            top: -17,
            width: 34,
            height: 34,
            border: '2px solid var(--sniptale-color-accent)',
            borderRadius: '999px',
            transform: 'translate(-100px, -100px)',
            boxShadow:
              '0 0 0 8px color-mix(in srgb, var(--sniptale-color-accent) 20%, transparent)',
          }}
        />
      ) : null}
      {props.clickAnimationEnabled && clickPoint ? (
        <div
          key={clickPoint.key}
          data-ui="content.video-recording.spotlight-click"
          style={{
            position: 'absolute',
            left: clickPoint.x,
            top: clickPoint.y,
            width: 44,
            height: 44,
            border: '2px solid var(--sniptale-color-accent)',
            borderRadius: '999px',
            transform: 'translate(-50%, -50%)',
            animation: 'sniptale-recording-click-ripple 420ms ease-out forwards',
          }}
        />
      ) : null}
    </div>
  );
}
