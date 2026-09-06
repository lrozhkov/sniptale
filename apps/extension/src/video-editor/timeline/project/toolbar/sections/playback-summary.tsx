import { Pause, Play, RotateCcw, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';
import { toolbarIconButtonClassName } from './constants/button';

export function formatPlaybackCounterTime(value: number): string {
  const totalTenths = Math.max(0, Math.round(value * 10));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;

  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function PlaybackToggleButton(props: { isPlaying: boolean; onTogglePlay: () => void }) {
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onTogglePlay}
      active={props.isPlaying}
      className={toolbarIconButtonClassName}
      aria-label={
        props.isPlaying
          ? translate('videoEditor.timeline.pause')
          : translate('videoEditor.timeline.play')
      }
      title={
        props.isPlaying
          ? translate('videoEditor.timeline.pause')
          : translate('videoEditor.timeline.play')
      }
    >
      {props.isPlaying ? (
        <Pause size={16} strokeWidth={2.2} />
      ) : (
        <Play size={16} strokeWidth={2.2} />
      )}
    </ContentToolbarButton>
  );
}

function PlaybackResetButton(props: { disabled?: boolean; onClearPlaybackRange: () => void }) {
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onClearPlaybackRange}
      className={[
        toolbarIconButtonClassName,
        props.disabled ? 'pointer-events-none invisible' : '',
      ].join(' ')}
      disabled={props.disabled}
      aria-label={translate('videoEditor.timeline.clearRange')}
      title={translate('videoEditor.timeline.clearRange')}
    >
      <RotateCcw size={14} strokeWidth={2} />
    </ContentToolbarButton>
  );
}

function PlaybackSeekToStartButton(props: { onSeekToStart: () => void }) {
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onSeekToStart}
      className={toolbarIconButtonClassName}
      aria-label={translate('videoEditor.timeline.seekToStart')}
      title={translate('videoEditor.timeline.seekToStart')}
    >
      <SkipBack size={14} strokeWidth={2} />
    </ContentToolbarButton>
  );
}

function PlaybackSeekToEndButton(props: { onSeekToEnd: () => void }) {
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onSeekToEnd}
      className={toolbarIconButtonClassName}
      aria-label={translate('videoEditor.timeline.seekToEnd')}
      title={translate('videoEditor.timeline.seekToEnd')}
    >
      <SkipForward size={14} strokeWidth={2} />
    </ContentToolbarButton>
  );
}

function PlaybackFrameStepButton(props: { direction: 'next' | 'previous'; onStep: () => void }) {
  const label = translate(
    props.direction === 'previous'
      ? 'videoEditor.timeline.previousFrame'
      : 'videoEditor.timeline.nextFrame'
  );
  return (
    <ContentToolbarButton
      type="button"
      onClick={props.onStep}
      className={toolbarIconButtonClassName}
      aria-label={label}
      title={label}
    >
      {props.direction === 'previous' ? (
        <StepBack size={14} strokeWidth={2} />
      ) : (
        <StepForward size={14} strokeWidth={2} />
      )}
    </ContentToolbarButton>
  );
}

function formatToolbarLoopRange(playbackRange: VideoEditorPlaybackRange | null): string | null {
  if (!playbackRange) {
    return null;
  }

  return `(${formatPlaybackCounterTime(playbackRange.start)}-${formatPlaybackCounterTime(
    playbackRange.end
  )})`;
}

function PlaybackSummaryMeta(props: {
  currentTime: number;
  duration: number;
  playbackRange: VideoEditorPlaybackRange | null;
}) {
  const loopRange = formatToolbarLoopRange(props.playbackRange);

  return (
    <div className="min-w-0 text-center">
      <p
        data-playback-counter="true"
        className={[
          'min-w-[96px] text-[13px] font-semibold tabular-nums',
          '@max-[1400px]/timeline:text-[12px] @max-[1000px]/timeline:text-[11px]',
          'text-[var(--sniptale-color-text-primary)]',
        ].join(' ')}
      >
        {loopRange ? (
          <span
            className={[
              'block whitespace-nowrap text-[11px] @max-[1000px]/timeline:text-[10px] leading-3',
              'text-[var(--sniptale-color-accent-emphasis)]',
            ].join(' ')}
          >
            {loopRange}
          </span>
        ) : null}
        <span className="block whitespace-nowrap">
          {formatPlaybackCounterTime(props.currentTime)} /{' '}
          {formatPlaybackCounterTime(props.duration)}
        </span>
      </p>
    </div>
  );
}

export function ProjectTimelinePlaybackSummary({
  currentTime,
  duration,
  isPlaying,
  playbackRange,
  onClearPlaybackRange,
  onSeekToEnd,
  onSeekToStart,
  onStepToNextFrame,
  onStepToPreviousFrame,
  onTogglePlay,
}: {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  playbackRange: VideoEditorPlaybackRange | null;
  onClearPlaybackRange: () => void;
  onSeekToEnd: () => void;
  onSeekToStart: () => void;
  onStepToNextFrame: () => void;
  onStepToPreviousFrame: () => void;
  onTogglePlay: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-nowrap items-center justify-center gap-[var(--timeline-control-gap)]">
      <PlaybackSeekToStartButton onSeekToStart={onSeekToStart} />
      <PlaybackFrameStepButton direction="previous" onStep={onStepToPreviousFrame} />
      <PlaybackToggleButton isPlaying={isPlaying} onTogglePlay={onTogglePlay} />
      <PlaybackFrameStepButton direction="next" onStep={onStepToNextFrame} />
      <PlaybackSeekToEndButton onSeekToEnd={onSeekToEnd} />
      <PlaybackResetButton disabled={!playbackRange} onClearPlaybackRange={onClearPlaybackRange} />
      <PlaybackSummaryMeta
        currentTime={currentTime}
        duration={duration}
        playbackRange={playbackRange}
      />
    </div>
  );
}
