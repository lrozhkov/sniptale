import { Pause, Play, RotateCcw, SkipBack } from 'lucide-react';

import { translate } from '../../../../../platform/i18n';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import type { ProjectTimelineToolbarProps } from '../types';
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

function formatToolbarLoopRange(
  playbackRange: ProjectTimelineToolbarProps['playbackRange']
): string | null {
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
  playbackRange: ProjectTimelineToolbarProps['playbackRange'];
}) {
  const loopRange = formatToolbarLoopRange(props.playbackRange);

  return (
    <div className="min-w-0 text-center max-[720px]:text-left">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--sniptale-color-text-muted)]">
        {translate('videoEditor.timeline.title')}
      </p>
      <p
        data-playback-counter="true"
        className={[
          'min-w-[176px] text-[12px] font-semibold tabular-nums',
          'text-[var(--sniptale-color-text-primary)] max-[720px]:min-w-0',
        ].join(' ')}
      >
        {loopRange ? (
          <span className="mr-2 text-[var(--sniptale-color-accent-emphasis)]">{loopRange}</span>
        ) : null}
        <span>
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
  onSeekToStart,
  onTogglePlay,
}: Pick<
  ProjectTimelineToolbarProps,
  | 'currentTime'
  | 'duration'
  | 'isPlaying'
  | 'playbackRange'
  | 'onClearPlaybackRange'
  | 'onSeekToStart'
  | 'onTogglePlay'
>) {
  return (
    <div
      className={[
        'flex min-w-0 flex-wrap items-center justify-center gap-2.5',
        'max-[720px]:justify-start max-[720px]:gap-1.5',
      ].join(' ')}
    >
      <PlaybackToggleButton isPlaying={isPlaying} onTogglePlay={onTogglePlay} />
      <PlaybackSeekToStartButton onSeekToStart={onSeekToStart} />
      <PlaybackResetButton disabled={!playbackRange} onClearPlaybackRange={onClearPlaybackRange} />
      <PlaybackSummaryMeta
        currentTime={currentTime}
        duration={duration}
        playbackRange={playbackRange}
      />
    </div>
  );
}
