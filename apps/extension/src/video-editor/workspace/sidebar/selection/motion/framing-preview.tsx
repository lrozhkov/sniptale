import { useCursorTrajectoryProject } from '../../../../preview/stage/runtime/cursor-trajectory';
import { OptionButtonsField } from '../shared/option-buttons';
import { InspectorActionButton } from '../shared/actions';
import { useContext, useEffect, useRef, useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import {
  VideoMotionFocusMode,
  type VideoProjectMotionRegion,
} from '../../../../../features/video/project/types';
import type { resolveCameraViewportFrame } from '../../../../../features/video/composition/motion/viewport';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { resolveFramingRenderCamera, useFramingFrame } from './framing-preview-frame';
import { useFramingInteraction, type FramingPreviewProps } from './framing-preview-interaction';

export function MotionFramingPreview(props: {
  motionRegion: VideoProjectMotionRegion;
  panel: WorkspaceSidebarSelectionPanelProps;
}) {
  const runtime = useContext(RuntimePreviewContext);
  if (!runtime) return null;
  return (
    <FramingPreviewSurface
      key={props.motionRegion.id}
      project={props.panel.project}
      region={
        props.panel.project.motionRegions?.find((region) => region.id === props.motionRegion.id) ??
        props.motionRegion
      }
      assetUrls={runtime.assetUrls}
      onCommitArea={(focusArea) => {
        props.panel.onClearPlacementMode();
        props.panel.onUpdateMotionRegion(props.motionRegion.id, {
          focusArea,
          focusMode: VideoMotionFocusMode.MANUAL_AREA,
        });
      }}
      onCommit={(focusPoint) => {
        props.panel.onClearPlacementMode();
        props.panel.onUpdateMotionRegion(props.motionRegion.id, {
          focusPoint,
          focusMode: VideoMotionFocusMode.MANUAL,
        });
      }}
    />
  );
}

export function FramingPreviewSurface(props: FramingPreviewProps) {
  const time = Math.min(props.project.duration, props.region.startTime + props.region.duration / 2);
  const preparation = useCursorTrajectoryProject(props.project, time);
  const { project, cameraFailed, retryCamera } = preparation;
  const cameraReady = preparation.canRender(time);
  const renderProps = { ...props, project };
  const following = props.region.focusMode === VideoMotionFocusMode.CURSOR;
  const [overview, setOverview] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gpuHostRef = useRef<HTMLDivElement>(null);
  const {
    ready,
    visible,
    failed,
    reload,
    viewport: cursorViewport,
    plan,
    nominalScale,
    update,
  } = useFramingFrame(renderProps, canvasRef, gpuHostRef, cameraReady);
  const interaction = useFramingInteraction(renderProps, overview, cursorViewport);
  const { areaPoints, viewport, left, top, width, height, handlers } = interaction;
  const camera = resolveFramingRenderCamera(renderProps, overview, interaction, cursorViewport);
  const cameraKey = JSON.stringify(camera);
  const cameraRef = useRef(camera);
  cameraRef.current = camera;
  useEffect(() => {
    if (cameraReady) update(cameraRef.current, overview);
  }, [cameraKey, overview, update, cameraReady]);

  return (
    <div className="space-y-2" data-ui="video-editor.framing-preview">
      {plan?.status === 'conflict' ? (
        <p role="status" className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate('videoEditor.app.exportCameraConflict')}
        </p>
      ) : plan?.status === 'ready' && plan.targetScale < (nominalScale ?? props.region.scale) ? (
        <p role="status" className="text-xs">
          {translate('videoEditor.sidebar.cameraExpansionApplied')}
        </p>
      ) : null}
      <OptionButtonsField
        label={translate('videoEditor.sidebar.framingPreviewLabel')}
        value={overview ? 'area' : 'result'}
        options={[
          { value: 'area', label: translate('videoEditor.sidebar.framingAreaView') },
          { value: 'result', label: translate('videoEditor.sidebar.framingResultView') },
        ]}
        onChange={(value) => setOverview(value === 'area')}
      />
      <button
        type="button"
        data-video-editor-local-navigation="true"
        aria-label={translate('videoEditor.sidebar.framingPreviewLabel')}
        disabled={!ready || !cameraReady}
        className={`relative block w-full overflow-hidden rounded-md border
border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-muted)]
touch-none ${overview ? 'cursor-move' : 'cursor-default'} disabled:cursor-default`}
        style={{ aspectRatio: `${width} / ${height}` }}
        {...(overview && !following ? handlers : {})}
      >
        <FramingOverlays
          canvasRef={canvasRef}
          gpuHostRef={gpuHostRef}
          visible={visible}
          ready={ready && cameraReady}
          failed={failed || cameraFailed}
          areaPoints={overview ? areaPoints : null}
          showOutline={overview}
          viewport={viewport}
          world={{ left, top, width, height }}
        />
      </button>
      {failed || cameraFailed ? (
        <InspectorActionButton
          compact
          onClick={() => {
            if (cameraFailed) retryCamera();
            if (failed) reload();
          }}
        >
          {translate('common.actions.retry')}
        </InspectorActionButton>
      ) : null}
    </div>
  );
}

function FramingOverlays({
  canvasRef,
  gpuHostRef,
  visible,
  ready,
  failed,
  areaPoints,
  viewport,
  world,
  showOutline,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  gpuHostRef: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  ready: boolean;
  failed: boolean;
  areaPoints: ReturnType<typeof useFramingInteraction>['areaPoints'];
  viewport: ReturnType<typeof resolveCameraViewportFrame>;
  world: { left: number; top: number; width: number; height: number };
  showOutline: boolean;
}) {
  const { left, top, width, height } = world;
  return (
    <>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="absolute pointer-events-none"
        style={{
          visibility: visible ? 'visible' : 'hidden',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
      <div
        ref={gpuHostRef}
        data-ui="video-editor.framing-preview.gpu-host"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
      {ready && areaPoints ? (
        <>
          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full pointer-events-none"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polygon
              data-framing-area-outline="true"
              points={Object.values(areaPoints)
                .map(
                  (point) =>
                    `${((point.x - left) / width) * 100},${((point.y - top) / height) * 100}`
                )
                .join(' ')}
              fill="none"
              className="stroke-[var(--sniptale-color-border-accent-strong)]"
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              aria-hidden="true"
              data-framing-corner={corner}
              className={`absolute z-10 h-3 w-3 rounded-sm border
border-[color:var(--sniptale-color-border-accent-strong)]
bg-[var(--sniptale-color-surface-panel)] pointer-events-auto`}
              style={{
                left: `${((areaPoints[corner].x - left) / width) * 100}%`,
                top: `${((areaPoints[corner].y - top) / height) * 100}%`,
                transform: 'translate(-50%, -50%)',
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))}
        </>
      ) : null}
      {ready && showOutline ? (
        <span
          aria-hidden="true"
          className={`absolute pointer-events-none border-2
border-[color:var(--sniptale-color-border-accent-strong)] rounded-sm`}
          style={{
            left: `${((viewport.viewportX - left) / width) * 100}%`,
            top: `${((viewport.viewportY - top) / height) * 100}%`,
            width: `${(viewport.viewportWidth / width) * 100}%`,
            height: `${(viewport.viewportHeight / height) * 100}%`,
          }}
        />
      ) : !ready ? (
        <span className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate(
            failed
              ? 'videoEditor.sidebar.framingPreviewFailed'
              : 'videoEditor.sidebar.framingPreviewLoading'
          )}
        </span>
      ) : null}
    </>
  );
}
