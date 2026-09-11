import { useContext, useRef, useState } from 'react';
import { translate } from '../../../../../platform/i18n';
import {
  VideoMotionFocusMode,
  type VideoProjectMotionRegion,
  type VideoProjectMotionArea,
} from '../../../../../features/video/project/types';
import type { resolveCameraViewportFrame } from '../../../../../features/video/composition/motion/viewport';
import { RuntimePreviewContext } from '../../../../runtime/controller/composition/contexts';
import type { WorkspaceSidebarSelectionPanelProps } from '../../contracts/selection-panel';
import { useFramingFrame } from './framing-preview-frame';
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
      region={props.motionRegion}
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
  const [overview, setOverview] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { areaMode, area, camera, viewport, left, top, width, height, handlers } =
    useFramingInteraction(props, overview);
  const { ready, failed, reload } = useFramingFrame(props, canvasRef, camera);

  return (
    <div className="space-y-2" data-ui="video-editor.framing-preview">
      <div className="flex gap-1" aria-label={translate('videoEditor.sidebar.framingPreviewLabel')}>
        {[true, false].map((mode) => (
          <button
            key={String(mode)}
            type="button"
            aria-pressed={overview === mode}
            onClick={() => setOverview(mode)}
            className={[
              'rounded-md px-2 py-1 text-xs cursor-pointer',
              overview === mode
                ? 'bg-[var(--sniptale-color-surface-hover)] text-[var(--sniptale-color-text-primary)]'
                : 'text-[var(--sniptale-color-text-secondary)]',
            ].join(' ')}
          >
            {translate(
              mode ? 'videoEditor.sidebar.framingAreaView' : 'videoEditor.sidebar.framingResultView'
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-video-editor-local-navigation="true"
        aria-label={translate('videoEditor.sidebar.framingPreviewLabel')}
        disabled={!ready}
        className={`relative block w-full overflow-hidden rounded-md border
border-[color:var(--sniptale-color-border-soft)] bg-[var(--sniptale-color-surface-muted)]
touch-none ${overview ? 'cursor-move' : 'cursor-default'} disabled:cursor-default`}
        style={{ aspectRatio: `${width} / ${height}` }}
        {...(overview ? handlers : {})}
      >
        <FramingOverlays
          canvasRef={canvasRef}
          ready={ready}
          failed={failed}
          area={overview ? area : null}
          showOutline={overview}
          viewport={viewport}
          world={{ left, top, width, height }}
        />
      </button>
      {failed ? (
        <button
          type="button"
          className="text-xs text-[var(--sniptale-color-text-secondary)] underline"
          onClick={reload}
        >
          {translate('common.actions.retry')}
        </button>
      ) : overview ? (
        <p className="text-xs text-[var(--sniptale-color-text-secondary)]">
          {translate(
            areaMode
              ? 'videoEditor.sidebar.framingAreaPreviewHint'
              : 'videoEditor.sidebar.framingPreviewHint'
          )}
        </p>
      ) : null}
    </div>
  );
}

function FramingOverlays({
  canvasRef,
  ready,
  failed,
  area,
  viewport,
  world,
  showOutline,
}: {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ready: boolean;
  failed: boolean;
  area: VideoProjectMotionArea | null;
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
          visibility: ready ? 'visible' : 'hidden',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {ready && area ? (
        <span
          aria-hidden="true"
          className={`absolute border border-dashed border-[color:var(--sniptale-color-border-accent-strong)]
pointer-events-none`}
          style={{
            left: `${((area.x - left) / width) * 100}%`,
            top: `${((area.y - top) / height) * 100}%`,
            width: `${(area.width / width) * 100}%`,
            height: `${(area.height / height) * 100}%`,
          }}
        >
          {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
            <span
              key={corner}
              data-framing-corner={corner}
              className={`absolute z-10 h-3 w-3 rounded-sm border
border-[color:var(--sniptale-color-border-accent-strong)]
bg-[var(--sniptale-color-surface-panel)] pointer-events-auto`}
              style={{
                left: corner.endsWith('w') ? 0 : '100%',
                top: corner.startsWith('n') ? 0 : '100%',
                transform: 'translate(-50%, -50%)',
                cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize',
              }}
            />
          ))}
        </span>
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
