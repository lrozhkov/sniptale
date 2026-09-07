import { formatTimelineRulerLabel } from '../../interaction-state/helpers';
import { X, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { VideoEditorPlaybackRange } from '../../../../interaction/playback/range';
import { toolbarIconButtonClassName } from './constants/button';

export function formatPlaybackCounterTime(value: number): string {
  return formatTimelineRulerLabel(value, true);
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
  onClearPlaybackRange: () => void;
}) {
  const loopRange = formatToolbarLoopRange(props.playbackRange);

  return (
    <div className="min-w-0 text-center @max-[1000px]/timeline:basis-full">
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
              'flex items-center justify-center gap-1 whitespace-nowrap text-[11px]',
              '@max-[1000px]/timeline:text-[10px] leading-3',
              'text-[var(--sniptale-color-accent-emphasis)]',
            ].join(' ')}
          >
            {loopRange}
            <ContentToolbarButton
              title={translate('videoEditor.timeline.clearRange')}
              dataUi="video-editor.timeline.toolbar.clear-range"
              onClick={props.onClearPlaybackRange}
              className="!h-4 !w-4 !min-w-4 !p-0 !text-[var(--sniptale-color-accent-emphasis)] [&_svg]:!size-3"
            >
              <X aria-hidden="true" />
            </ContentToolbarButton>
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
    <div
      className={[
        'flex shrink-0 flex-nowrap items-center justify-center gap-[var(--timeline-control-gap)]',
        '@max-[1000px]/timeline:w-44 @max-[1000px]/timeline:flex-wrap',
      ].join(' ')}
    >
      <PlaybackSeekToStartButton onSeekToStart={onSeekToStart} />
      <PlaybackFrameStepButton direction="previous" onStep={onStepToPreviousFrame} />
      <PlaybackToggleButton isPlaying={isPlaying} onTogglePlay={onTogglePlay} />
      <PlaybackFrameStepButton direction="next" onStep={onStepToNextFrame} />
      <PlaybackSeekToEndButton onSeekToEnd={onSeekToEnd} />
      <PlaybackSummaryMeta
        currentTime={currentTime}
        duration={duration}
        playbackRange={playbackRange}
        onClearPlaybackRange={onClearPlaybackRange}
      />
    </div>
  );
}
