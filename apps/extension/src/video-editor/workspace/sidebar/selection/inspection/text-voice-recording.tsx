import { useEffect } from 'react';
import type { VideoProjectTextVoiceController } from '../../../../runtime/session/text-voice';
import { translate } from '../../../../../platform/i18n';
import {
  AudioRecordingDeviceSelect,
  AudioRecordingDownloadButton,
  AudioRecordingTransport,
} from '../../../../../composition/audio-recording/dialog/controls';
import { ToggleField } from '../../../../../ui/compact-inspector-controls';
import { NumberInput } from '../inputs/number';
import { RecordingLevelMeter } from '../../../../../composition/audio-recording/dialog/level-meter';
import { renderAudioRecordingTrimPanel } from '../../../../../composition/audio-recording/dialog/trim';
import { InspectorActionButton } from '../shared/actions';

/** Only the view unmounts during category navigation; capture stays in the mounted session. */
export function ProjectTextVoiceRecording({
  recording,
}: {
  recording: VideoProjectTextVoiceController['recording'];
}) {
  const { session, durationLimit, setVisible } = recording;
  useEffect(() => {
    setVisible(true);
    return () => setVisible(false);
  }, [setVisible]);
  const { controller } = session;
  const { transport, trim } = controller;
  const capturing = transport.status === 'recording' || transport.status === 'paused';
  const locked = session.isSaving || session.starting;
  return (
    <div data-ui="video-editor.text-voice.recording" className="sniptale-parameter-stack min-w-0">
      {!trim ? (
        <fieldset disabled={locked || capturing} className="sniptale-parameter-stack min-w-0">
          <AudioRecordingDeviceSelect
            compact
            value={session.deviceId}
            onChange={session.setDeviceId}
            disabled={locked || capturing}
          />
          <ToggleField
            label={translate('videoEditor.app.recordAudioPlayVideo')}
            value={recording.playVideo}
            onChange={recording.setPlayVideo}
            disabled={locked || capturing}
          />
          <ToggleField
            label={translate('gallery.videoReview.voiceoverDurationLimit')}
            value={durationLimit.enabled}
            onChange={durationLimit.setEnabled}
            disabled={locked || capturing}
          />
          {durationLimit.enabled ? (
            <NumberInput
              label={translate('videoEditor.app.recordAudioLimit')}
              value={Number(durationLimit.text)}
              onChange={(value) => durationLimit.setText(String(value))}
              min={0.1}
              max={3600}
              step={1}
              unit="s"
              scrub={false}
              disabled={locked || capturing}
            />
          ) : null}
        </fieldset>
      ) : null}
      <fieldset disabled={locked || durationLimit.invalid} className="contents">
        <AudioRecordingTransport
          compact
          status={transport.status}
          durationLabel={transport.durationLabel}
          error={transport.error}
          onStartRecording={session.startRecording}
          onStopRecording={transport.stopRecording}
          onPauseRecording={transport.pauseRecording}
          onResumeRecording={transport.resumeRecording}
        />
      </fieldset>
      {!trim ? (
        <RecordingLevelMeter compact meter={controller.meter} preparing={session.starting} />
      ) : null}
      {renderAudioRecordingTrimPanel(trim, locked, true)}
      {session.starting ? (
        <p role="status" className="text-xs">
          {translate('videoEditor.app.recordAudioPreparing')}
        </p>
      ) : null}
      {session.saveError ? (
        <p role="alert" className="text-sm">
          {session.saveError}
        </p>
      ) : null}
      {trim ? (
        <div className="flex flex-wrap items-center gap-2">
          <AudioRecordingDownloadButton
            iconOnly
            disabled={locked || session.isDownloading}
            onDownload={session.downloadTake}
          />
          <InspectorActionButton
            disabled={locked}
            onClick={() => {
              void session.saveRecording();
            }}
          >
            {translate('videoEditor.sidebar.textVoiceRecordingNext')}
          </InspectorActionButton>
        </div>
      ) : null}
    </div>
  );
}
