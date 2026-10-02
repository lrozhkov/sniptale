import { useEffect, useMemo, useRef, useState } from 'react';
import { createLogger } from '@sniptale/platform/observability/logger';
import { downloadRecordedTake, useRecordingTakeDownload } from './download-take';
import { translate } from '../../../platform/i18n';
import { createTrimmedRecordingFile } from '../trim-file';
import type { AudioRecordingModalProps } from './types';
import type { AudioTrimRange } from '../session-types';
import { usePlaybackSpaceShortcut } from '../../library-preview/shortcuts';
import { useAudioRecordingSession } from '../session';
import { useRecordingDismissal } from './dismissal';
const logger = createLogger({ namespace: 'AudioRecordingDialog' });

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

type RecordingSaveStage = 'prepare' | 'attach';
class RecordingSaveFailure extends Error {
  constructor(readonly stage: RecordingSaveStage) {
    super('Recording save failed');
  }
}

async function prepareAndAttachTake(
  take: Blob,
  trim: AudioTrimRange,
  signal: AbortSignal,
  onSave: AudioRecordingModalProps['onSave'],
  onRetained: () => void
) {
  let stage: RecordingSaveStage = 'prepare';
  try {
    const file = await createTrimmedRecordingFile(take, trim.trimStart, trim.trimEnd);
    signal.throwIfAborted();
    stage = 'attach';
    await onSave(file, trim, signal, take, onRetained);
  } catch (error) {
    if (signal.aborted) throw error;
    throw new RecordingSaveFailure(stage);
  }
}

function reportRecordingSaveFailure(stage: RecordingSaveStage) {
  logger.error('recording_save_failed', { stage });
  return translate(
    stage === 'prepare'
      ? 'videoEditor.app.recordAudioPrepareFailed'
      : 'videoEditor.app.recordAudioSaveFailedRetry'
  );
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
      await prepareAndAttachTake(
        take,
        { trimStart: controller.save.trimStart, trimEnd: controller.save.trimEnd },
        active.signal,
        onSave,
        () => {
          if (lifetime.current === active && !active.signal.aborted) retainedTake.current = take;
        }
      );
      if (active.signal.aborted) return;
      controller.save.resetSession();
      onClose();
    } catch (error) {
      if (!active.signal.aborted) {
        const stage = error instanceof RecordingSaveFailure ? error.stage : 'attach';
        setSaveError(reportRecordingSaveFailure(stage));
      }
    } finally {
      if (lifetime.current === active && !active.signal.aborted) {
        savingRef.current = false;
        setIsSaving(false);
      }
    }
  };
  const takeDownload = useRecordingTakeDownload({
    isOpen,
    take: controller.save.audioBlob,
    download: downloadRecordedTake,
    isBlocked: () => savingRef.current || confirmation.isPending(),
    onError: () => setSaveError(translate('videoEditor.app.recordAudioDownloadFailed')),
  });
  function beginCapture() {
    const active = lifetime.current;
    if (startingRef.current || savingRef.current || !active || active.signal.aborted) return;
    retainedTake.current = null;
    takeDownload.reset();
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
    downloadTake: takeDownload.downloadTake,
    isDownloading: takeDownload.isDownloading,
  };
}
