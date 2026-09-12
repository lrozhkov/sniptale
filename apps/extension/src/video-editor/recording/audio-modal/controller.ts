import { useCallback, useEffect, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { createTrimmedRecordingFile } from './trim-file';
import type { AudioRecordingModalProps } from './shared';
import { usePlaybackSpaceShortcut } from '../../../composition/library-preview/shortcuts';
import { useAudioRecordingSession } from './session';
export type { AudioRecordingControllerState } from './session-types';

export function useAudioRecordingController(
  isOpen: boolean,
  playbackDisabled = false,
  deviceId = '',
  timeline?: AudioRecordingModalProps['timeline']
) {
  const controller = useAudioRecordingSession(isOpen, deviceId, timeline);
  usePlaybackSpaceShortcut(() => {
    if (playbackDisabled || !controller.trim) return;
    if (controller.trim.audioRef.current?.paused === false) controller.trim.pauseSelection();
    else void controller.trim.playSelection();
  }, isOpen);
  return controller;
}

/** Capture, commit and dismissal share a single busy gate for both recording surfaces. */
export function useAudioRecordingDialogSession({
  isOpen,
  onClose,
  onSave,
  timeline,
}: AudioRecordingModalProps) {
  const savingRef = useRef(false);
  const [deviceId, setDeviceId] = useState('');
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestClose = useCallback(() => {
    if (!savingRef.current) {
      timeline?.onStop();
      onClose();
    }
  }, [onClose, timeline]);
  const controller = useAudioRecordingController(isOpen, isSaving, deviceId, timeline);
  useEffect(() => {
    if (isOpen) setSaveError(null);
  }, [isOpen]);
  const saveRecording = async () => {
    if (savingRef.current || !controller.save.audioBlob) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(
        await createTrimmedRecordingFile(
          controller.save.audioBlob,
          controller.save.trimStart,
          controller.save.trimEnd
        ),
        {
          trimStart: controller.save.trimStart,
          trimEnd: controller.save.trimEnd,
        }
      );
      controller.save.resetSession();
      onClose();
    } catch {
      setSaveError(translate('common.errors.actionFailed'));
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };
  const startRecording = () => {
    if (startingRef.current || savingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setSaveError(null);
    void controller.transport.startRecording().finally(() => {
      startingRef.current = false;
      setStarting(false);
    });
  };
  return {
    deviceId,
    setDeviceId,
    controller,
    isSaving,
    saveError,
    starting,
    requestClose,
    startRecording,
    saveRecording,
  };
}
