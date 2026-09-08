import { useState, type ReactNode } from 'react';
import { Pause, Play } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { InspectorPanel } from '../../../ui/compact-inspector-controls';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { SourceRangeTimeline } from '../../chrome/source-range-timeline';
import { useRecordedAudioPeaks } from './waveform';
import { formatPreciseTime } from '../../contracts/time-format';
import type { AudioRecordingTrimController } from './session-types';

function AudioRecordingTrimPanel(
  props: AudioRecordingTrimController & {
    disabled: boolean;
    compact?: boolean;
    actions?: ReactNode;
  }
) {
  const [cursor, setCursor] = useState(0);
  const peaks = useRecordedAudioPeaks(props.audioBlob, props.recordedDuration);
  const seek = (time: number) => {
    if (props.disabled) return;
    props.pauseSelection();
    const next = Math.max(0, Math.min(time, props.recordedDuration));
    if (props.audioRef.current) props.audioRef.current.currentTime = next;
    setCursor(next);
  };
  const select = (range: { start: number; end: number }) => {
    if (props.disabled) return;
    props.selectRange(range);
    seek(range.start);
  };
  const Panel = props.compact ? 'div' : InspectorPanel;
  return (
    <Panel
      data-ui="video-editor.audio-recording.trim-panel"
      className={
        props.compact ? 'grid gap-1 [&_[data-ui="video-editor.source-lane"]]:h-8' : 'grid gap-2 p-3'
      }
    >
      <audio
        ref={props.audioRef}
        src={props.audioUrl}
        hidden
        onTimeUpdate={(event) => setCursor(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => {
          props.resolveDuration(event.currentTarget.duration);
        }}
      />
      <SourceRangeTimeline
        duration={props.recordedDuration}
        fps={100}
        cursor={cursor}
        range={{ start: props.trimStart, end: props.trimEnd }}
        disabled={props.disabled}
        peaks={peaks ?? []}
        onSeek={seek}
        onRange={select}
      />
      <div className="flex items-center gap-3" data-ui="video-editor.audio-recording.playback">
        <ContentToolbarButton
          className="!h-9 !w-9 !min-w-9 !px-0"
          disabled={props.disabled}
          title={translate(
            props.isPlayingSelection ? 'videoEditor.timeline.pause' : 'videoEditor.timeline.play'
          )}
          onClick={() => {
            if (props.isPlayingSelection) props.pauseSelection();
            else void props.playSelection();
          }}
        >
          {props.isPlayingSelection ? <Pause size={16} /> : <Play size={16} />}
        </ContentToolbarButton>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
          {formatPreciseTime(cursor)} / {formatPreciseTime(props.recordedDuration)}
        </span>
        {props.actions && <div className="ml-auto flex items-center gap-2">{props.actions}</div>}
      </div>
      {peaks === null && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.recordAudioWaveformUnavailable')}
        </p>
      )}
    </Panel>
  );
}

export function renderAudioRecordingTrimPanel(
  controller: AudioRecordingTrimController | null,
  disabled = false,
  compact = false,
  actions?: ReactNode
) {
  return controller ? (
    <AudioRecordingTrimPanel
      key={controller.audioUrl}
      {...controller}
      disabled={disabled}
      compact={compact}
      actions={actions}
    />
  ) : null;
}
