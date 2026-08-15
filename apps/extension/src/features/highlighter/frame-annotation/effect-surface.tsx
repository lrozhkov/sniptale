import React from 'react';
import type { FrameAnnotationSnapshotV1 } from './model';
import { getFrameAnnotationBlurBackdropStyle } from './effect-style';
import { resolveFocusCutoutGeometry } from '../frame-surface';

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
  blurAmount: number;
  edgeOverscan?: number;
  frames: FrameAnnotationSnapshotV1[];
  height: number;
  opacity: number;
  width: number;
}) {
  const maskId = React.useId().replaceAll(':', '');
  const blurAmount = Math.min(25, Math.max(0, props.blurAmount));
  const opacity = Math.min(1, Math.max(0, props.opacity));
  const edgeOverscan = Math.max(0, props.edgeOverscan ?? 0);
  const surfaceWidth = props.width + edgeOverscan;
  const surfaceHeight = props.height + edgeOverscan;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <svg height="0" style={{ position: 'absolute' }} width="0">
        <defs>
          <mask
            height={surfaceHeight}
            id={maskId}
            maskUnits="userSpaceOnUse"
            width={surfaceWidth}
            x="0"
            y="0"
          >
            <rect fill="white" height={surfaceHeight} width={surfaceWidth} />
            {props.frames.map((frame) => {
              const cutout = resolveFocusCutoutGeometry(frame);
              return (
                <rect
                  fill="black"
                  height={cutout.height}
                  key={frame.id}
                  rx={cutout.radius}
                  width={cutout.width}
                  x={cutout.x}
                  y={cutout.y}
                />
              );
            })}
          </mask>
        </defs>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: surfaceWidth,
          height: surfaceHeight,
          backgroundColor: `rgb(0 0 0 / ${opacity})`,
          backdropFilter: `blur(${blurAmount}px)`,
          WebkitBackdropFilter: `blur(${blurAmount}px)`,
          mask: `url(#${maskId})`,
          WebkitMask: `url(#${maskId})`,
        }}
      />
    </div>
  );
}
