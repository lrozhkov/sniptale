import React from 'react';
import { FrameAnnotationDecoration } from './decoration';
import type { FrameAnnotationSnapshotV1 } from './model';
import { resolveFrameAnnotationVisualScene } from './render-scene';
import {
  FrameAnnotationBlurSurface,
  FrameAnnotationDistortionFilter,
  FrameAnnotationFocusSurface,
} from './effect-surface';
import { getFrameAnnotationBlurBackdropStyle } from './effect-style';
import { FrameCalloutExportSurface } from './callout/export-surface';
import { FrameStepBadgeInteractiveSurface } from './step-badge/interactive-surface';

export function FrameAnnotationExportSurface(props: {
  baseImageUrl: string;
  height: number;
  snapshots: FrameAnnotationSnapshotV1[];
  width: number;
}) {
  const [portalTarget, setPortalTarget] = React.useState<HTMLDivElement | null>(null);
  const focusFrames = props.snapshots.filter((frame) => frame.effectMode === 'focus');
  const focusOpacity = focusFrames.reduce(
    (maximum, frame) => Math.max(maximum, frame.focusSettings?.opacity ?? 0.5),
    0
  );
  const distortionScale = props.snapshots.reduce(
    (maximum, frame) =>
      frame.effectMode === 'blur'
        ? Math.max(maximum, getFrameAnnotationBlurBackdropStyle(frame).distortionScale ?? 0)
        : maximum,
    0
  );
  return (
    <div
      ref={setPortalTarget}
      style={
        {
          position: 'relative',
          width: props.width,
          height: props.height,
          overflow: 'hidden',
          '--sniptale-color-text-inverse': '#ffffff',
          '--sniptale-color-surface-base': '#ffffff',
          '--sniptale-color-accent': '#f97316',
        } as React.CSSProperties
      }
    >
      {distortionScale > 0 ? <FrameAnnotationDistortionFilter scale={distortionScale} /> : null}
      <img
        alt=""
        src={props.baseImageUrl}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
      {props.snapshots.map((frame) =>
        frame.effectMode === 'blur' ? (
          <div
            key={`blur:${frame.id}`}
            style={{
              position: 'absolute',
              left: frame.x,
              top: frame.y,
              width: frame.width,
              height: frame.height,
            }}
          >
            <FrameAnnotationBlurSurface frame={frame} />
          </div>
        ) : null
      )}
      {focusFrames.length > 0 ? (
        <FrameAnnotationFocusSurface
          frames={focusFrames}
          height={props.height}
          opacity={focusOpacity}
          width={props.width}
        />
      ) : null}
      {props.snapshots.map((frame) => (
        <FrameAnnotationExportEntry frame={frame} key={frame.id} portalTarget={portalTarget} />
      ))}
    </div>
  );
}

function FrameAnnotationExportEntry(props: {
  frame: FrameAnnotationSnapshotV1;
  portalTarget: HTMLDivElement | null;
}) {
  const scene = resolveFrameAnnotationVisualScene({ frame: props.frame, state: 'idle' });
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: props.frame.x,
          top: props.frame.y,
          width: props.frame.width,
          height: props.frame.height,
        }}
      >
        <div style={scene.frameStyle}>
          <FrameAnnotationDecoration
            frameId={props.frame.id}
            fillStyle={scene.fillStyle}
            strokeStyle={scene.strokeStyle}
          />
        </div>
      </div>
      {props.portalTarget && props.frame.stepBadge?.enabled ? (
        <FrameStepBadgeInteractiveSurface
          borderColor={scene.borderColor}
          borderWidth={scene.borderWidth}
          chrome="export"
          controlsPortalTarget={props.portalTarget}
          frameRect={props.frame}
          onPositionChange={() => undefined}
          portalTheme={null}
          settings={props.frame.stepBadge}
          showSettingsHandle={false}
          surfacePortalTarget={props.portalTarget}
          {...(props.frame.borderSettings?.fillColor
            ? { fillColor: props.frame.borderSettings.fillColor }
            : {})}
          {...(props.frame.borderSettings?.fillOpacity === undefined
            ? {}
            : { fillOpacity: props.frame.borderSettings.fillOpacity })}
          {...(props.frame.borderSettings?.shadow === undefined
            ? {}
            : { shadow: props.frame.borderSettings.shadow })}
        />
      ) : null}
      {props.portalTarget && props.frame.callout?.enabled ? (
        <FrameCalloutExportSurface frame={props.frame} portalTarget={props.portalTarget} />
      ) : null}
    </>
  );
}
