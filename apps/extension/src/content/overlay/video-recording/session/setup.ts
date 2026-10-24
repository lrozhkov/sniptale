import { useCallback, useState, type MutableRefObject } from 'react';
import type { VideoRecordingSurfaceCommand } from '@sniptale/runtime-contracts/video/types/messages.surface';
import type { VideoOutputProfile } from '@sniptale/runtime-contracts/video/types/types';
import type { VideoRecordingToolbarState } from './state';

/** Disposable setup intent shared with Start and command observation admission. */
export type RecordingSetupState = {
  captureMode: 'TAB' | 'TAB_CROP';
  pending: boolean;
  outputGeneration: number;
};

/** Owns transient capture choice and pending output intent for one mounted recording surface. */
export function useRecordingSetup(
  command: (value: VideoRecordingSurfaceCommand) => Promise<void>,
  stateRef: MutableRefObject<VideoRecordingToolbarState>,
  setupRef: MutableRefObject<RecordingSetupState>,
  actionError: () => string
) {
  const [captureMode, setCaptureMode] = useState<'TAB' | 'TAB_CROP'>(setupRef.current.captureMode);
  const [setupPending, setSetupPending] = useState(false);
  const onCaptureModeChange = useCallback(
    (mode: 'TAB' | 'TAB_CROP') => {
      if (
        setupRef.current.pending ||
        (stateRef.current.phase !== 'idle' && stateRef.current.phase !== 'error')
      )
        return;
      setupRef.current.captureMode = mode;
      setCaptureMode(mode);
    },
    [setupRef, stateRef]
  );
  const update = useCallback(
    async (
      value: Extract<
        Parameters<typeof command>[0],
        { kind: 'select-quality-profile' | 'set-output-profile' }
      >
    ) => {
      if (
        setupRef.current.pending ||
        (stateRef.current.phase !== 'idle' && stateRef.current.phase !== 'error')
      ) {
        throw new Error(actionError());
      }
      setupRef.current.outputGeneration += 1;
      setupRef.current.pending = true;
      setSetupPending(true);
      try {
        await command(value);
      } finally {
        setupRef.current.pending = false;
        setSetupPending(false);
      }
    },
    [actionError, command, setupRef, stateRef]
  );
  return {
    captureMode,
    setupPending,
    onCaptureModeChange,
    onQualityProfileChange: (profileId: string) =>
      update({ kind: 'select-quality-profile', profileId }),
    onOutputProfileChange: (outputProfile: VideoOutputProfile) =>
      update({ kind: 'set-output-profile', outputProfile }),
  };
}
