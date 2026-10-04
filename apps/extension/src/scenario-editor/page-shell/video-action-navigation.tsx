import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Keyboard, MousePointer2, Minus, Plus } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { GuideVideoAction } from '@sniptale/runtime-contracts/scenario/types/guide';
import type { useLibraryPlayback } from '../../composition/library-preview/playback';
import type { Translate } from '../../platform/i18n';
import { guideVideoActionAt } from './runtime/video-actions';
import './video-action-navigation.css';
type Playback = ReturnType<typeof useLibraryPlayback>;

/** Source-only navigation keeps hover disposable and seeks through the shared player owner. */
export function GuideVideoActionNavigation({
  playback,
  actions,
  onHover,
  t,
}: {
  playback: Playback;
  actions: readonly GuideVideoAction[];
  onHover(action: GuideVideoAction | null): void;
  t: Translate;
}) {
  const [zoom, setZoom] = useState(1);
  const duration = playback.media.duration ?? 0;
  const available = actions.filter((action) => action.time <= duration);
  const actionTitle = (action: GuideVideoAction) => {
    const kind =
      action.kind === 'KEY' ? 'scenario.editor.guideVideoKey' : 'scenario.editor.guideVideoClick';
    return `${action.time.toFixed(2)} · ${action.label || t(kind)}`;
  };
  const current = guideVideoActionAt(available, playback.media.time);
  const seek = (time: number) => {
    playback.video.current?.pause();
    playback.seek(time);
  };
  return (
    <div className="guide-video-action-timeline">
      <div className="guide-video-action-heading">
        <span>{t('scenario.editor.guideVideoActions')}</span>
        <ContentToolbarButton
          title={t('scenario.editor.guideTimelineZoomOut')}
          disabled={zoom === 1}
          onClick={() => setZoom(Math.max(1, zoom / 2))}
        >
          <Minus size={14} />
        </ContentToolbarButton>
        <ContentToolbarButton
          title={t('scenario.editor.guideTimelineZoomIn')}
          disabled={zoom === 8}
          onClick={() => setZoom(Math.min(8, zoom * 2))}
        >
          <Plus size={14} />
        </ContentToolbarButton>
      </div>
      <div className="guide-video-action-list" aria-label={t('scenario.editor.guideVideoActions')}>
        {available.map((action) => (
          <ContentToolbarButton
            key={action.id}
            title={actionTitle(action)}
            aria-pressed={current?.id === action.id}
            disabled={!playback.ready}
            onMouseEnter={() => onHover(action)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(action)}
            onBlur={() => onHover(null)}
            onClick={() => seek(action.time)}
          >
            {action.kind === 'KEY' ? <Keyboard size={14} /> : <MousePointer2 size={14} />}
            <span>{action.label || action.time.toFixed(2)}</span>
          </ContentToolbarButton>
        ))}
        {!available.length && <small>{t('scenario.editor.guideVideoNoActions')}</small>}
      </div>
      <GuideVideoTimePlane playback={playback} actions={available} zoom={zoom} t={t} />
    </div>
  );
}

/** Pointer preview is disposable; only captured gestures and keyboard commands seek. */
function GuideVideoTimePlane({
  playback,
  actions,
  zoom,
  t,
}: {
  playback: Playback;
  actions: readonly GuideVideoAction[];
  zoom: number;
  t: Translate;
}) {
  const [hover, setHover] = useState<{ time: number; flip: boolean } | null>(null);
  const duration = playback.media.duration ?? 0;
  const ready = playback.ready && duration > 0;
  useEffect(() => setHover(null), [zoom, duration, ready]);
  const seek = (time: number) => {
    playback.video.current?.pause();
    playback.seek(time);
  };
  const pointerTime = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return rect.width > 0
      ? Math.max(0, Math.min(duration, ((event.clientX - rect.left) / rect.width) * duration))
      : 0;
  };
  return (
    <div className="guide-video-time-scroll" onScroll={() => setHover(null)}>
      <div
        className="guide-video-time-plane"
        style={{ width: `${zoom * 100}%` }}
        role="slider"
        tabIndex={ready ? 0 : -1}
        aria-disabled={!ready}
        aria-label={t('scenario.editor.guideVideoPosition')}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={playback.media.time}
        onKeyDown={(event) => {
          if (!ready || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          seek(
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? duration
                : playback.media.time + (event.key === 'ArrowLeft' ? -0.1 : 0.1)
          );
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !ready) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          seek(pointerTime(event));
        }}
        onPointerMove={(event) => {
          if (!ready) return;
          const time = pointerTime(event);
          if (event.pointerType !== 'touch') {
            const viewport = event.currentTarget.parentElement!.getBoundingClientRect();
            setHover({ time, flip: event.clientX > viewport.right - 60 });
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) seek(time);
        }}
        onPointerLeave={() => setHover(null)}
        onPointerCancel={() => setHover(null)}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <span className="guide-video-tick" key={fraction} style={{ left: `${fraction * 100}%` }}>
            {(duration * fraction).toFixed(1)}
          </span>
        ))}
        {actions.map((action) => (
          <i
            key={action.id}
            className="guide-video-event-tick"
            style={{ left: `${(action.time / duration) * 100}%` }}
          />
        ))}
        {hover && (
          <span
            className="guide-video-hover-guide"
            aria-hidden="true"
            style={{ left: `${(hover.time / duration) * 100}%` }}
          >
            <span data-flip={hover.flip}>{hover.time.toFixed(2)}</span>
          </span>
        )}
        <i
          className="guide-video-playhead"
          style={{ left: `${duration ? (playback.media.time / duration) * 100 : 0}%` }}
        />
      </div>
    </div>
  );
}

/** Projects normalized source coordinates inside object-contain, including zoom and letterboxing. */
export function GuideVideoActionOverlay({
  playback,
  action,
}: {
  playback: Playback;
  action: GuideVideoAction | undefined | null;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: node.clientWidth, height: node.clientHeight })
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const video = playback.video.current;
  const ratio =
    video?.videoWidth && video.videoHeight
      ? Math.min(size.width / video.videoWidth, size.height / video.videoHeight)
      : 0;
  const width = (video?.videoWidth ?? 0) * ratio;
  const height = (video?.videoHeight ?? 0) * ratio;
  return (
    <div ref={root} className="guide-video-action-overlay" aria-hidden="true">
      {action?.point && ratio > 0 && (
        <span
          className="guide-video-click-point"
          style={{
            left: (size.width - width) / 2 + action.point.x * width,
            top: (size.height - height) / 2 + action.point.y * height,
          }}
        />
      )}
    </div>
  );
}
