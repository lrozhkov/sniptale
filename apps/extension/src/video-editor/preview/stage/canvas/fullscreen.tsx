import { LoaderCircle, Pause, Play, Search, X } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type PointerEvent,
} from 'react';
import { translate } from '../../../../platform/i18n/index';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { ProductRange } from '@sniptale/ui/product-form-controls';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import { formatPreciseTime } from '../../../contracts/time-format';

function isStageFullscreen(frameRef: RefObject<HTMLElement | null>): boolean {
  return document.fullscreenElement === frameRef.current;
}

export function usePreviewStageFullscreen(frameRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const wasFullscreen = useRef(false);
  useLayoutEffect(() => {
    if (isFullscreen)
      frameRef.current
        ?.querySelector<HTMLButtonElement>(
          '[data-ui="video-editor.preview.fullscreen-transport-action"]'
        )
        ?.focus({ preventScroll: true });
    else if (wasFullscreen.current) {
      const target = triggerRef.current?.isConnected
        ? triggerRef.current
        : frameRef.current?.querySelector<HTMLButtonElement>(
            '[data-ui="video-editor.preview.fullscreen-toggle"]'
          );
      target?.focus({ preventScroll: true });
    }
    wasFullscreen.current = isFullscreen;
  }, [isFullscreen, frameRef]);

  useEffect(() => {
    const syncFullscreenState = () => {
      setIsFullscreen(isStageFullscreen(frameRef));
    };

    syncFullscreenState();
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, [frameRef]);

  const openFullscreen = useCallback(() => {
    const frameNode = frameRef.current;
    if (!frameNode || isStageFullscreen(frameRef)) {
      return;
    }

    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void frameNode.requestFullscreen?.();
  }, [frameRef]);

  const closeFullscreen = useCallback(() => {
    if (!isStageFullscreen(frameRef)) {
      return;
    }

    void document.exitFullscreen?.();
  }, [frameRef]);

  return {
    closeFullscreen,
    isFullscreen,
    openFullscreen,
    toggleFullscreen: isFullscreen ? closeFullscreen : openFullscreen,
  };
}

interface PreviewStageFullscreenTransportProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isPreparing?: boolean | undefined;
  playbackRange: VideoEditorPlaybackRange | null;
  onClose: () => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
}

export function PreviewStageFullscreenTransport(props: PreviewStageFullscreenTransportProps) {
  const range = props.playbackRange ?? { start: 0, end: props.duration };
  const playLabel = translate(
    props.isPlaying || props.isPreparing
      ? 'videoEditor.timeline.pause'
      : 'videoEditor.timeline.play'
  );
  const closeLabel = translate('videoEditor.stage.exitFullscreen');
  return (
    <div
      className="flex min-h-10 min-w-0 shrink-0 items-center gap-2"
      data-ui="video-editor.preview.fullscreen-transport"
    >
      <ContentToolbarButton
        onClick={props.onTogglePlay}
        aria-label={playLabel}
        title={playLabel}
        dataUi="video-editor.preview.fullscreen-transport-action"
      >
        {props.isPreparing ? (
          <LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" aria-hidden />
        ) : props.isPlaying ? (
          <Pause size={16} />
        ) : (
          <Play size={16} />
        )}
      </ContentToolbarButton>
      <ProductRange
        className="min-w-12 flex-1"
        min={range.start}
        max={range.end}
        step={0.01}
        value={Math.min(range.end, Math.max(range.start, props.currentTime))}
        aria-label={translate('videoEditor.stage.fullscreenSeek')}
        onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
        data-ui="video-editor.preview.fullscreen-seek"
      />
      <span
        className="whitespace-nowrap text-[11px] tabular-nums text-[var(--sniptale-color-text-muted)]"
        title={
          props.playbackRange
            ? [
                translate('videoEditor.timeline.loopRangePrefix'),
                formatPreciseTime(range.start),
                '-',
                formatPreciseTime(range.end),
              ].join(' ')
            : undefined
        }
      >
        {formatPreciseTime(props.currentTime)} / {formatPreciseTime(props.duration)}
      </span>
      <label className="flex w-40 shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
        <Search size={14} aria-hidden />
        <ProductRange
          className="min-w-0 flex-1"
          min={1}
          max={2}
          step={0.1}
          value={props.zoom ?? 1}
          aria-label={translate('videoEditor.sidebar.mediaPreviewZoomLabel')}
          onChange={(event) => props.onZoomChange?.(Number(event.currentTarget.value))}
        />
        <span className="w-8 text-right">{Math.round((props.zoom ?? 1) * 100)}%</span>
      </label>
      <ContentToolbarButton
        onClick={props.onClose}
        title={closeLabel}
        aria-label={closeLabel}
        dataUi="video-editor.preview.fullscreen-transport-action"
      >
        <X size={16} aria-hidden />
      </ContentToolbarButton>
    </div>
  );
}

export function useFullscreenPreviewPan(
  viewport: RefObject<HTMLDivElement | null>,
  zoom: number,
  fullscreen: boolean
) {
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(
    null
  );
  const previousZoom = useRef(zoom);
  const [dragging, setDragging] = useState(false);
  const finish = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (active && viewport.current?.hasPointerCapture(active.id))
      viewport.current.releasePointerCapture(active.id);
  }, [viewport]);
  useEffect(() => {
    if (!fullscreen || zoom === 1) finish();
    return finish;
  }, [fullscreen, zoom, finish]);
  useLayoutEffect(() => {
    const node = viewport.current;
    if (node && fullscreen) {
      const ratio = zoom / previousZoom.current;
      node.scrollLeft = (node.scrollLeft + node.clientWidth / 2) * ratio - node.clientWidth / 2;
      node.scrollTop = (node.scrollTop + node.clientHeight / 2) * ratio - node.clientHeight / 2;
    }
    previousZoom.current = zoom;
  }, [fullscreen, zoom, viewport]);
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (gesture.current?.id === event.pointerId) finish();
  };
  return {
    dragging,
    handlers: {
      onPointerDownCapture: (event: PointerEvent<HTMLDivElement>) => {
        if (!fullscreen || zoom <= 1 || event.button !== 0 || gesture.current) return;
        event.preventDefault();
        event.stopPropagation();
        const node = event.currentTarget;
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: node.scrollLeft,
          top: node.scrollTop,
        };
        node.setPointerCapture(event.pointerId);
        setDragging(true);
      },
      onPointerMove: (event: PointerEvent<HTMLDivElement>) => {
        const active = gesture.current;
        if (!active || active.id !== event.pointerId) return;
        event.currentTarget.scrollLeft = active.left + active.x - event.clientX;
        event.currentTarget.scrollTop = active.top + active.y - event.clientY;
      },
      onPointerUp: end,
      onPointerCancel: end,
      onLostPointerCapture: end,
    },
  };
}
