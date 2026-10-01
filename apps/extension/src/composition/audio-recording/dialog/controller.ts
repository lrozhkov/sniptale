import { useEffect, useMemo, useRef, useState } from 'react';
import { translate } from '../../../platform/i18n';
import { createTrimmedRecordingFile } from '../trim-file';
import type { AudioRecordingModalProps } from './types';
import { usePlaybackSpaceShortcut } from '../../library-preview/shortcuts';
import { useAudioRecordingSession } from '../session';
import { useRecordingDismissal } from './dismissal';
export type { AudioRecordingControllerState } from '../session-types';

export function useAudioRecordingController(
  isOpen: boolean,
  playbackDisabled = false,
  deviceId = '',
  timeline?: AudioRecordingModalProps['timeline'],
  captureLimitSeconds?: number,
  suspended = false
) {
  const captureTimeline = useMemo(
    () =>
      timeline
        ? captureLimitSeconds !== undefined && captureLimitSeconds > 0
          ? { ...timeline, duration: Math.min(timeline.duration, captureLimitSeconds) }
          : timeline
        : captureLimitSeconds
          ? {
              startTime: 0,
              duration: captureLimitSeconds,
              beforeStart: async () => {},
              onStop: () => {},
            }
          : undefined,
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
  }, isOpen && !suspended);
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
  const retainedTake = useRef<Blob | null>(null);
  const confirmation: ReturnType<typeof useRecordingDismissal> = useRecordingDismissal({
    getController: () => controller,
    isBusy: () => savingRef.current,
    isActive: () => !!lifetime.current && !lifetime.current.signal.aborted,
    isRetained: (take) => retainedTake.current === take,
    close: () => {
      lifetime.current?.abort();
      controller.save.resetSession();
      timeline?.onStop();
      onClose();
    },
    restart: beginCapture,
  });
  const requestClose = () => confirmation.request('close');
  const controller = useAudioRecordingController(
    isOpen,
    isSaving,
    deviceId,
    timeline,
    captureLimitSeconds,
    confirmation.open
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
    retainedTake.current = null;
    return () => {
      active.abort();
      if (lifetime.current === active) lifetime.current = null;
    };
  }, [isOpen]);
  const saveRecording = async () => {
    const active = lifetime.current;
    if (
      savingRef.current ||
      confirmation.isPending() ||
      !controller.save.audioBlob ||
      !active ||
      active.signal.aborted
    )
      return;
    const take = controller.save.audioBlob;
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
        active.signal,
        take,
        () => {
          if (lifetime.current === active && !active.signal.aborted) retainedTake.current = take;
        }
      );
      if (active.signal.aborted) return;
      controller.save.resetSession();
      onClose();
    } catch {
      if (!active.signal.aborted)
        setSaveError(translate('videoEditor.app.recordAudioSaveFailedRetry'));
    } finally {
      if (lifetime.current === active && !active.signal.aborted) {
        savingRef.current = false;
        setIsSaving(false);
      }
    }
  };
  function beginCapture() {
    const active = lifetime.current;
    if (startingRef.current || savingRef.current || !active || active.signal.aborted) return;
    retainedTake.current = null;
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
  }
  const startRecording = () => confirmation.request('restart');
  return {
    confirmation,
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
