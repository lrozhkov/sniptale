import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { createTrimmedRecordingFile } from '../trim-file';
import type { AudioRecordingModalProps } from './types';
import { usePlaybackSpaceShortcut } from '../../library-preview/shortcuts';
import { useAudioRecordingSession } from '../session';
export type { AudioRecordingControllerState } from '../session-types';

export function useAudioRecordingController(
  isOpen: boolean,
  playbackDisabled = false,
  deviceId = '',
  timeline?: AudioRecordingModalProps['timeline'],
  captureLimitSeconds?: number
) {
  const captureTimeline = useMemo(
    () =>
      timeline ??
      (captureLimitSeconds
        ? {
            startTime: 0,
            duration: captureLimitSeconds,
            beforeStart: async () => {},
            onStop: () => {},
          }
        : undefined),
    [timeline, captureLimitSeconds]
  );
  const controller = useAudioRecordingSession(
    isOpen,
    {
      noSupport: translate('videoEditor.app.recordAudioNoSupport'),
      permissionDenied: translate('videoEditor.app.recordAudioPermissionDenied'),
      startFailed: translate('videoEditor.app.recordAudioStartFailed'),
      playFailed: translate('videoEditor.app.sourcePlayFailed'),
    },
    deviceId,
    captureTimeline
  );
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
  captureLimitSeconds,
}: AudioRecordingModalProps) {
  const lifetime = useRef<AbortController | null>(null);
  const savingRef = useRef(false);
  const [deviceId, setDeviceId] = useState('');
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestClose = useCallback(() => {
    if (!savingRef.current) {
      lifetime.current?.abort();
      timeline?.onStop();
      onClose();
    }
  }, [onClose, timeline]);
  const controller = useAudioRecordingController(
    isOpen,
    isSaving,
    deviceId,
    timeline,
    captureLimitSeconds
  );
  useEffect(() => {
    if (!isOpen) return;
    const active = new AbortController();
    lifetime.current = active;
    savingRef.current = false;
    startingRef.current = false;
    setIsSaving(false);
    setStarting(false);
    setSaveError(null);
    return () => {
      active.abort();
      if (lifetime.current === active) lifetime.current = null;
    };
  }, [isOpen]);
  const saveRecording = async () => {
    const active = lifetime.current;
    if (savingRef.current || !controller.save.audioBlob || !active || active.signal.aborted) return;
    savingRef.current = true;
    setIsSaving(true);
    setSaveError(null);
    controller.trim?.pauseSelection();
    try {
      const file = await createTrimmedRecordingFile(
        controller.save.audioBlob,
        controller.save.trimStart,
        controller.save.trimEnd
      );
      active.signal.throwIfAborted();
      await onSave(
        file,
        { trimStart: controller.save.trimStart, trimEnd: controller.save.trimEnd },
        active.signal
      );
      if (active.signal.aborted) return;
      controller.save.resetSession();
      onClose();
    } catch {
      if (!active.signal.aborted) setSaveError(translate('common.errors.actionFailed'));
    } finally {
      if (lifetime.current === active && !active.signal.aborted) {
        savingRef.current = false;
        setIsSaving(false);
      }
    }
  };
  const startRecording = () => {
    const active = lifetime.current;
    if (startingRef.current || savingRef.current || !active || active.signal.aborted) return;
    startingRef.current = true;
    setStarting(true);
    setSaveError(null);
    void controller.transport
      .startRecording()
      .catch(() => {
        if (lifetime.current === active && !active.signal.aborted)
          setSaveError(translate('videoEditor.app.recordAudioStartFailed'));
      })
      .finally(() => {
        if (lifetime.current === active && !active.signal.aborted) {
          startingRef.current = false;
          setStarting(false);
        }
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
