import { Minimize2, Pause, Play } from 'lucide-react';
import { useCallback, useEffect, useState, type RefObject } from 'react';
import { translate } from '../../../../platform/i18n/index';
import { CompactRange } from '../../../../ui/compact-inspector-controls';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { ValueBadge } from '@sniptale/ui/editor-chrome';
import { FloatingChromeToolbar } from '@sniptale/ui/floating-chrome';
import type { VideoEditorPlaybackRange } from '../../../interaction/playback/range';
import { formatPreciseTime } from '../../../contracts/time-format';

function isStageFullscreen(frameRef: RefObject<HTMLElement | null>): boolean {
  return document.fullscreenElement === frameRef.current;
}

export function usePreviewStageFullscreen(frameRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

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

function FullscreenTransportButton(props: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <ProductActionButton
      compact
      type="button"
      onClick={props.onClick}
      title={props.label}
      data-ui="video-editor.preview.fullscreen-transport-action"
      tone="secondary"
    >
      {props.icon}
      <span>{props.label}</span>
    </ProductActionButton>
  );
}

interface PreviewStageFullscreenTransportProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  onClose: () => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}

function FullscreenTransportTimeline(
  props: Pick<
    PreviewStageFullscreenTransportProps,
    'currentTime' | 'duration' | 'onSeek' | 'playbackRange'
  >
) {
  const sliderRange = resolveFullscreenSeekRange(props.duration, props.playbackRange);

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-medium">
        <span className="text-[var(--sniptale-color-text-primary)]">
          {translate('videoEditor.stage.fullscreenPlayer')}
        </span>
        <ValueBadge className="font-mono tabular-nums">
          {formatPreciseTime(props.currentTime)} / {formatPreciseTime(props.duration)}
        </ValueBadge>
      </div>
      {props.playbackRange ? (
        <div className="mb-1 text-[10px] font-medium text-[var(--sniptale-color-accent-emphasis)]">
          {translate('videoEditor.timeline.loopRangePrefix')}{' '}
          {formatPreciseTime(props.playbackRange.start)} -{' '}
          {formatPreciseTime(props.playbackRange.end)}
        </div>
      ) : null}
      <CompactRange
        type="range"
        min={sliderRange.min}
        max={sliderRange.max}
        step={0.01}
        value={clampFullscreenSeekValue(props.currentTime, sliderRange)}
        aria-label={translate('videoEditor.stage.fullscreenSeek')}
        onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
        data-ui="video-editor.preview.fullscreen-seek"
      />
    </div>
  );
}

function resolveFullscreenSeekRange(
  duration: number,
  playbackRange: VideoEditorPlaybackRange | null
) {
  if (!playbackRange) {
    return { max: duration, min: 0 };
  }

  return { max: playbackRange.end, min: playbackRange.start };
}

function clampFullscreenSeekValue(
  currentTime: number,
  sliderRange: { max: number; min: number }
): number {
  return Math.min(sliderRange.max, Math.max(sliderRange.min, currentTime));
}

function resolvePlaybackButtonCopy(isPlaying: boolean) {
  return {
    icon: isPlaying ? <Pause size={16} strokeWidth={2.2} /> : <Play size={16} strokeWidth={2.2} />,
    label: isPlaying
      ? translate('videoEditor.timeline.pause')
      : translate('videoEditor.timeline.play'),
  };
}

export function PreviewStageFullscreenTransport(props: PreviewStageFullscreenTransportProps) {
  const playbackButton = resolvePlaybackButtonCopy(props.isPlaying);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-6">
      <FloatingChromeToolbar
        dataUi="video-editor.preview.fullscreen-transport"
        className="pointer-events-auto w-full max-w-[880px] items-center gap-3 px-4 py-3"
      >
        <FullscreenTransportButton
          icon={playbackButton.icon}
          label={playbackButton.label}
          onClick={props.onTogglePlay}
        />
        <FullscreenTransportTimeline
          currentTime={props.currentTime}
          duration={props.duration}
          playbackRange={props.playbackRange}
          onSeek={props.onSeek}
        />
        <FullscreenTransportButton
          icon={<Minimize2 size={16} strokeWidth={2} />}
          label={translate('videoEditor.stage.exitFullscreen')}
          onClick={props.onClose}
        />
      </FloatingChromeToolbar>
    </div>
  );
}
