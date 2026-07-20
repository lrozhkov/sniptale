import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import {
  VideoRecordingStatus,
  type VideoRecordingRuntimeState,
} from '@sniptale/runtime-contracts/video/types/types';
import type { PopupPage } from '../navigation/actions';
import type { RecordingControlCapability } from './recording-control-capability';

export function usePopupRecordingNavigationEffect(state: {
  page: PopupPage;
  recordingState: VideoRecordingRuntimeState;
  setIsStartPending: Dispatch<SetStateAction<boolean>>;
  setPage: Dispatch<SetStateAction<PopupPage>>;
  setRecordingControlCapability: Dispatch<SetStateAction<RecordingControlCapability | null>>;
  setStartError: Dispatch<SetStateAction<string | null>>;
}) {
  const didAutoOpenVideoRef = useRef(false);
  const page = state.page;
  const recordingStatus = state.recordingState.status;
  const setIsStartPending = state.setIsStartPending;
  const setPage = state.setPage;
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

    didAutoOpenVideoRef.current = true;

    if (page !== 'video') {
      setPage('video');
    }
  }, [
    page,
    recordingStatus,
    setIsStartPending,
    setPage,
    setRecordingControlCapability,
    setStartError,
  ]);
}
