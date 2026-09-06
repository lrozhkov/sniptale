import { useState } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { InspectorPanel } from '../../../ui/compact-inspector-controls';
import { EditorIconButton } from '@sniptale/ui/editor-chrome';
import { SourceRangeTimeline } from '../../chrome/source-range-timeline';
import { useRecordedAudioPeaks } from './waveform';
import { formatPreciseTime } from '../../contracts/time-format';
import type { AudioRecordingTrimController } from './session-types';

function AudioRecordingTrimPanel(props: AudioRecordingTrimController & { disabled: boolean }) {
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
  return (
    <InspectorPanel data-ui="video-editor.audio-recording.trim-panel" className="grid gap-3 p-4">
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
        <EditorIconButton
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
        </EditorIconButton>
        <span className="text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
          {formatPreciseTime(cursor)} / {formatPreciseTime(props.recordedDuration)}
        </span>
        <span className="ml-auto text-xs tabular-nums text-[var(--sniptale-color-text-muted)]">
          {formatPreciseTime(props.trimStart)} — {formatPreciseTime(props.trimEnd)}
        </span>
        <EditorIconButton
          disabled={
            props.disabled || (props.trimStart === 0 && props.trimEnd === props.recordedDuration)
          }
          title={translate('videoEditor.app.sourceReset')}
          onClick={() => select({ start: 0, end: props.recordedDuration })}
        >
          <RotateCcw size={15} />
        </EditorIconButton>
      </div>
      {peaks === null && (
        <p className="text-xs text-[var(--sniptale-color-text-muted)]">
          {translate('videoEditor.app.recordAudioWaveformUnavailable')}
        </p>
      )}
    </InspectorPanel>
  );
}

export function renderAudioRecordingTrimPanel(
  controller: AudioRecordingTrimController | null,
  disabled = false
) {
  return controller ? (
    <AudioRecordingTrimPanel key={controller.audioUrl} {...controller} disabled={disabled} />
  ) : null;
}
