import type React from 'react';
import { PauseCircle, PlayCircle } from 'lucide-react';
import { translate } from '../../../platform/i18n';
import { InspectorPanel, NumericRow } from '../../../ui/compact-inspector-controls';
import type { AudioRecordingTrimController } from './session-types';
import { RecordingActionButton } from './controls';

function AudioRecordingRangeInput(props: {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
}) {
  const commitChange = (nextValue: number) => props.onChange(nextValue);

  return (
    <NumericRow
      label={props.label}
      min={props.min}
      max={props.max}
      step={0.1}
      value={props.value}
      precision={1}
      onPreviewValue={commitChange}
      onCommitValue={commitChange}
    />
  );
}

function clampTrimStart(nextStart: number, maxTrimStart: number) {
  return Math.max(0, Math.min(nextStart, maxTrimStart));
}

function clampTrimEnd(nextEnd: number, minTrimEnd: number, recordedDuration: number) {
  return Math.max(minTrimEnd, Math.min(nextEnd, recordedDuration));
}

function AudioRecordingTrimPlayer(props: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl: string;
  onTrimEndChange: (trimEnd: number) => void;
}) {
  return (
    <audio
      ref={props.audioRef}
      controls
      src={props.audioUrl}
      className="w-full"
      onLoadedMetadata={(event) => {
        const duration = event.currentTarget.duration;
        if (!Number.isFinite(duration) || duration <= 0) {
          return;
        }

        props.onTrimEndChange(duration);
      }}
    />
  );
}

function AudioRecordingTrimInputs(props: {
  onTrimEndChange: (trimEnd: number) => void;
  onTrimStartChange: (trimStart: number) => void;
  recordedDuration: number;
  trimEnd: number;
  trimStart: number;
}) {
  const minTrimEnd = Math.max(0.1, props.trimStart + 0.1);
  const maxTrimStart = Math.max(0, props.trimEnd - 0.1);

  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AudioRecordingRangeInput
        label={translate('videoEditor.app.recordAudioTrimStartLabel')}
        min={0}
        max={maxTrimStart}
        value={props.trimStart}
        onChange={(nextStart) => props.onTrimStartChange(clampTrimStart(nextStart, maxTrimStart))}
      />
      <AudioRecordingRangeInput
        label={translate('videoEditor.app.recordAudioTrimEndLabel')}
        min={minTrimEnd}
        max={props.recordedDuration}
        value={props.trimEnd}
        onChange={(nextEnd) =>
          props.onTrimEndChange(clampTrimEnd(nextEnd, minTrimEnd, props.recordedDuration))
        }
      />
    </div>
  );
}

function AudioRecordingTrimButton(props: {
  isPlayingSelection: boolean;
  onPauseSelection: () => void;
  onPlaySelection: () => Promise<void>;
}) {
  return (
    <RecordingActionButton
      icon={
        props.isPlayingSelection ? (
          <PauseCircle size={16} strokeWidth={2.1} />
        ) : (
          <PlayCircle size={16} strokeWidth={2.1} />
        )
      }
      label={translate('videoEditor.app.recordAudioPlaySelection')}
      onClick={() => {
        if (props.isPlayingSelection) {
          props.onPauseSelection();
          return;
        }

        void props.onPlaySelection();
      }}
    />
  );
}

function AudioRecordingTrimPanel(props: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  audioUrl: string;
  isPlayingSelection: boolean;
  onPauseSelection: () => void;
  onPlaySelection: () => Promise<void>;
  onTrimEndChange: (trimEnd: number) => void;
  onTrimStartChange: (trimStart: number) => void;
  recordedDuration: number;
  trimEnd: number;
  trimStart: number;
}) {
  return (
    <InspectorPanel data-ui="video-editor.audio-recording.trim-panel" className="grid gap-4 p-4">
      <AudioRecordingTrimPlayer
        audioRef={props.audioRef}
        audioUrl={props.audioUrl}
        onTrimEndChange={props.onTrimEndChange}
      />
      <AudioRecordingTrimInputs
        onTrimEndChange={props.onTrimEndChange}
        onTrimStartChange={props.onTrimStartChange}
        recordedDuration={props.recordedDuration}
        trimEnd={props.trimEnd}
        trimStart={props.trimStart}
      />
      <AudioRecordingTrimButton
        isPlayingSelection={props.isPlayingSelection}
        onPauseSelection={props.onPauseSelection}
        onPlaySelection={props.onPlaySelection}
      />
    </InspectorPanel>
  );
}

export function renderAudioRecordingTrimPanel(controller: AudioRecordingTrimController | null) {
  if (!controller) {
    return null;
  }

  return (
    <AudioRecordingTrimPanel
      audioRef={controller.audioRef}
      audioUrl={controller.audioUrl}
      isPlayingSelection={controller.isPlayingSelection}
      onPauseSelection={controller.pauseSelection}
      onPlaySelection={controller.playSelection}
      onTrimEndChange={controller.setTrimEnd}
      onTrimStartChange={controller.setTrimStart}
      recordedDuration={controller.recordedDuration}
      trimEnd={controller.trimEnd}
      trimStart={controller.trimStart}
    />
  );
}
