import { TimelineRecordingBackdrop, TimelineRecordingPanel } from './timeline-panel';
import type React from 'react';
import { ProductModal } from '@sniptale/ui/product-modal';
import { useAudioRecordingFocus } from '../../../composition/audio-recording/dialog-focus';
import { useAudioRecordingDialogSession } from '../../../composition/audio-recording/dialog/controller';
import { MaterialAudioRecordingModal } from '../../../composition/audio-recording/dialog';
import { AudioRecordingDeviceSelect } from '../../../composition/audio-recording/dialog/controls';
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
}: AudioRecordingModalProps): React.JSX.Element | null {
  const { titleId, handleKeyDown } = useAudioRecordingFocus(isOpen);
  const session = useAudioRecordingDialogSession({ isOpen, onClose, onSave, timeline });
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
  const device = (
    <AudioRecordingDeviceSelect
      value={deviceId}
      onChange={setDeviceId}
      disabled={starting || isSaving || controller.transport.status === 'recording'}
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
          onKeyDown={handleKeyDown}
          onClose={requestClose}
          closeOnBackdrop={false}
          labelledBy={titleId}
          width="min(800px, calc(100vw - 32px))"
          maxHeight="calc(100vh - 24px)"
        >
          <TimelineRecordingPanel
            titleId={titleId}
            startTime={timeline.startTime}
            duration={timeline.duration}
            controller={controller}
            device={device}
            starting={starting}
            saving={isSaving}
            error={saveError}
            onStart={startRecording}
            onClose={requestClose}
            onSave={saveRecording}
          />
        </ProductModal>
      </>
    );

  return null;
}
