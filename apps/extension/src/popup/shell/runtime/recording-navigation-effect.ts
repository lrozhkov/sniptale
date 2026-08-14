import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupPage } from '../navigation/actions';
import type { PopupNavigationResult, PopupNavigationSource } from './types/navigation';
import type { RecordingControlCapability } from './recording-control-capability';

export function usePopupRecordingNavigationEffect(state: {
  page: PopupPage;
  recordingState: VideoRecordingRuntimeState;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  navigateToPage: (
    page: PopupPage,
    source?: PopupNavigationSource
  ) => Promise<PopupNavigationResult>;
  setRecordingControlCapability: Dispatch<SetStateAction<RecordingControlCapability | null>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
}) {
  const didAutoOpenVideoRef = useRef(false);
  const page = state.page;
  const recordingStatus = state.recordingState.status;
  const setIsStartPending = state.setIsStartPending;
  const navigateToPage = state.navigateToPage;
  const setRecordingControlCapability = state.setRecordingControlCapability;
  const setStartError = state.setStartError;

  useEffect(() => {
    if (recordingStatus === VideoRecordingStatus.IDLE) {
      didAutoOpenVideoRef.current = false;
      setRecordingControlCapability(null);
      return;
    }

    setIsStartPending(false);
    setStartError(null);

    if (didAutoOpenVideoRef.current) {
      return;
    }

    if (page === 'video') {
      didAutoOpenVideoRef.current = true;
      return;
    }

    void navigateToPage('video', 'recording').then((result) => {
      didAutoOpenVideoRef.current = result === 'committed' || result === 'unchanged';
    });
  }, [
    page,
    recordingStatus,
    setIsStartPending,
    navigateToPage,
    setRecordingControlCapability,
    setStartError,
  ]);
}
