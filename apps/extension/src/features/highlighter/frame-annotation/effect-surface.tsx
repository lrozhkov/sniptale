import React from 'react';
import type { FrameAnnotationSnapshotV1 } from './model';
import { getFrameAnnotationBlurBackdropStyle } from './effect-style';

export function FrameAnnotationBlurSurface({ frame }: { frame: FrameAnnotationSnapshotV1 }) {
  const effect = getFrameAnnotationBlurBackdropStyle(frame);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: Math.max(0, frame.borderSettings?.radius ?? 0),
        backdropFilter: effect.backdropFilter,
        WebkitBackdropFilter: effect.backdropFilter,
        backgroundColor: effect.backgroundColor,
        imageRendering: effect.imageRendering as React.CSSProperties['imageRendering'],
        pointerEvents: 'none',
      }}
    />
  );
}

export function FrameAnnotationDistortionFilter(props: { scale: number }) {
  return (
    <svg
      aria-hidden="true"
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    >
      <defs>
        <filter height="140%" id="sniptale-distortion-filter" width="140%" x="-20%" y="-20%">
          <feTurbulence
            baseFrequency="0.02"
            numOctaves={3}
            result="noise"
            seed={5}
            type="fractalNoise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale={props.scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

export function FrameAnnotationFocusSurface(props: {
  frames: FrameAnnotationSnapshotV1[];
  height: number;
  opacity: number;
  width: number;
}) {
  const maskId = React.useId().replaceAll(':', '');
  return (
    <svg
      aria-hidden="true"
      height={props.height}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      width={props.width}
    >
      <defs>
        <mask id={maskId}>
          <rect fill="white" height="100%" width="100%" />
          {props.frames.map((frame) => (
            <rect
              fill="black"
              height={frame.height}
              key={frame.id}
              rx={frame.borderSettings?.radius ?? 0}
              width={frame.width}
              x={frame.x}
              y={frame.y}
            />
          ))}
        </mask>
      </defs>
      <rect
        fill={`rgb(0 0 0 / ${Math.min(1, Math.max(0, props.opacity))})`}
        height="100%"
        mask={`url(#${maskId})`}
        width="100%"
      />
    </svg>
  );
}
