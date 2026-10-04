import { RecordingDiscardConfirmation } from '../../../composition/audio-recording/dialog/dismissal';
import { TimelineRecordingBackdrop, TimelineRecordingPanel } from './timeline-panel';
import type React from 'react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { useAudioRecordingFocus } from '../../../composition/audio-recording/dialog-focus';
import { useAudioRecordingDialogSession } from '../../../composition/audio-recording/dialog/controller';
import { MaterialAudioRecordingModal } from '../../../composition/audio-recording/dialog';
import { AudioRecordingDeviceSelect } from '../../../composition/audio-recording/dialog/controls';
import {
  RecordingDurationLimit,
  useRecordingDurationLimit,
} from '../../../composition/audio-recording/dialog/duration-limit';
import { RecordingPlaybackChoice } from '../../../composition/audio-recording/dialog/playback-choice';
import { useEffect, useRef } from 'react';
import type { AudioRecordingModalProps } from '../../../composition/audio-recording/dialog/types';

export function AudioRecordingModal(props: AudioRecordingModalProps) {
  return props.timeline ? (
    <TimelineAudioRecordingModal {...props} />
  ) : (
    <MaterialAudioRecordingModal {...props} />
  );
}

function TimelineAudioRecordingModal({
  isOpen,
  onClose,
  onSave,
  timeline,
  playVideo = true,
  playbackRunning = false,
  onPlayVideoChange,
}: AudioRecordingModalProps): React.JSX.Element | null {
  const durationLimit = useRecordingDurationLimit(timeline?.duration ?? 0);
  const session = useAudioRecordingDialogSession({
    isOpen,
    onClose,
    onSave,
    timeline,
    captureLimitSeconds: durationLimit.seconds,
  });
  const { titleId, handleKeyDown } = useAudioRecordingFocus(isOpen, session.confirmation.open);
  const {
    deviceId,
    setDeviceId,
    controller,
    isSaving,
    saveError,
    starting,
    requestClose,
    startRecording,
    saveRecording,
  } = session;
  const sawPlayback = useRef(false);
  useEffect(() => {
    if (!isOpen || !playVideo) {
      sawPlayback.current = false;
      return;
    }
    if (playbackRunning) sawPlayback.current = true;
    else if (sawPlayback.current && controller.transport.status === 'recording') {
      sawPlayback.current = false;
      controller.transport.stopRecording();
    }
  }, [controller.transport, isOpen, playVideo, playbackRunning]);
  const device = (
    <AudioRecordingDeviceSelect
      value={deviceId}
      onChange={setDeviceId}
      disabled={
        starting || isSaving || ['recording', 'paused'].includes(controller.transport.status)
      }
    />
  );
  if (!isOpen) return null;
  if (timeline)
    return (
      <>
        <TimelineRecordingBackdrop />
        <ProductModal
          backdropClassName="!bg-[color:color-mix(in_srgb,var(--sniptale-color-overlay)_18%,transparent)]"
          dialogClassName={[
            '!top-auto !bottom-3 !transform-[translate(-50%,0)] !rounded-lg',
            '!bg-[var(--sniptale-color-surface-panel)]',
          ].join(' ')}
          onKeyDown={(event) => {
            handleKeyDown(event);
            if (event.key === 'Escape' && !event.defaultPrevented && !session.confirmation.open) {
              event.preventDefault();
              event.stopPropagation();
              requestClose();
            }
          }}
          onClose={requestClose}
          closeOnBackdrop={false}
          labelledBy={titleId}
          width="min(800px, calc(100vw - 32px))"
          maxHeight="calc(100vh - 24px)"
          scrollable
        >
          <TimelineRecordingPanel
            titleId={titleId}
            startTime={timeline.startTime}
            duration={timeline.duration}
            captureDuration={durationLimit.effective}
            limitInvalid={durationLimit.invalid}
            durationOptions={
              <RecordingDurationLimit
                value={durationLimit}
                maximum={timeline.duration}
                disabled={
                  starting ||
                  isSaving ||
                  ['recording', 'paused'].includes(controller.transport.status)
                }
              />
            }
            controller={controller}
            device={device}
            playbackChoice={
              <RecordingPlaybackChoice
                checked={playVideo}
                disabled={
                  starting ||
                  isSaving ||
                  ['recording', 'paused'].includes(controller.transport.status)
                }
                onChange={(value) => onPlayVideoChange?.(value)}
              />
            }
            starting={starting}
            saving={isSaving}
            error={saveError}
            onStart={startRecording}
            onClose={requestClose}
            onSave={saveRecording}
            onDownload={session.downloadTake}
            downloading={session.isDownloading}
          />
        </ProductModal>
        <RecordingDiscardConfirmation value={session.confirmation} />
      </>
    );

  return null;
}
