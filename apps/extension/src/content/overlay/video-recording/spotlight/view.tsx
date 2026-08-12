import { useEffect, useState } from 'react';

type SpotlightPoint = { x: number; y: number; clickKey: number };

export function VideoRecordingSpotlight(props: { active: boolean }) {
  const [point, setPoint] = useState<SpotlightPoint>({ x: -100, y: -100, clickKey: 0 });
  useEffect(() => {
    if (!props.active) return;
    const move = (event: PointerEvent) =>
      setPoint((current) => ({ ...current, x: event.clientX, y: event.clientY }));
    const click = (event: MouseEvent) =>
      setPoint({ x: event.clientX, y: event.clientY, clickKey: Date.now() });
    document.addEventListener('pointermove', move, true);
    document.addEventListener('click', click, true);
    return () => {
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('click', click, true);
    };
  }, [props.active]);
  if (!props.active) return null;
  return (
    <div
      aria-hidden
      data-ui="content.video-recording.spotlight"
      style={{ position: 'fixed', inset: 0, zIndex: 2147483638, pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,.34)',
          maskImage: `radial-gradient(circle 54px at ${point.x}px ${point.y}px, transparent 0 38px, black 54px)`,
          WebkitMaskImage: `radial-gradient(circle 54px at ${point.x}px ${point.y}px, transparent 0 38px, black 54px)`,
        }}
      />
      <div
        key={point.clickKey}
        style={{
          position: 'absolute',
          left: point.x,
          top: point.y,
          width: 34,
          height: 34,
          border: '2px solid var(--sniptale-color-accent)',
          borderRadius: '999px',
          transform: 'translate(-50%, -50%)',
          animation: point.clickKey ? 'sniptale-pulse 300ms ease-out' : undefined,
          boxShadow: '0 0 0 8px color-mix(in srgb, var(--sniptale-color-accent) 20%, transparent)',
        }}
      />
    </div>
  );
}
