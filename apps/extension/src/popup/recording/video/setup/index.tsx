import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { VideoSetupFooter } from '../footer';
import { VideoSetupBody } from './body';
import { getVideoSetupViewModel } from './view-model';
import type { VideoSetupPageProps } from './types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { getRecording } from '../../../../composition/persistence/recordings/index';
import { useSavedRecordingMessageEffect } from './saved-recording-effect';

const POST_RECORD_SAVE_CHECK_ATTEMPTS = 8;
const POST_RECORD_SAVE_CHECK_DELAY_MS = 250;

type PostRecordEffectArgs = {
  activeRecordingId: string | null;
  lastActiveRecordingIdRef: MutableRefObject<string | null>;
  recordingStatus: VideoRecordingStatus;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setPostRecordRecordingId: (value: string | null) => void;
  shouldShowPostRecordRef: MutableRefObject<boolean>;
  verificationTokenRef: MutableRefObject<number>;
};

export default function VideoSetupPage(props: VideoSetupPageProps) {
  const postRecord = useVideoPostRecordState(props);
  const viewModel = getVideoSetupViewModel(postRecord.displayProps);

  return (
    <div className="flex h-full flex-col gap-3">
      <VideoSetupBody
        {...postRecord.displayProps}
        postRecordRecordingId={postRecord.postRecordRecordingId}
        onClosePostRecord={postRecord.closePostRecord}
        showSavingState={postRecord.showSavingState}
        viewModel={viewModel}
      />
      <VideoSetupFooter
        canStart={viewModel.canStart}
        startButtonLabel={viewModel.startButtonLabel}
        startDisabledReason={viewModel.startDisabledReason}
        onStart={props.onStart}
        onPauseResume={props.onPauseResume}
        onStop={postRecord.handleStop}
        onCancel={postRecord.handleCancel}
        recordingState={postRecord.displayProps.recordingState}
        galleryTitle={viewModel.galleryTitle}
      />
    </div>
  );
}

function useVideoPostRecordState(props: VideoSetupPageProps) {
  const lastActiveRecordingIdRef = useRef<string | null>(null);
  const postRecordVerificationTokenRef = useRef(0);
  const shouldShowPostRecordRef = useRef(false);
  const state = usePostRecordLocalState();
  const displayProps = createPostRecordDisplayProps(props, state);

  usePostRecordEffects({
    activeRecordingId: props.activeRecordingId,
    lastActiveRecordingIdRef,
    recordingStatus: props.recordingState.status,
    setIsCancellingStart: state.setIsCancellingStart,
    setIsDiscardingRecording: state.setIsDiscardingRecording,
    setPostRecordRecordingId: state.setPostRecordRecordingId,
    shouldShowPostRecordRef,
    verificationTokenRef: postRecordVerificationTokenRef,
  });

  const handleStop = () => {
    shouldShowPostRecordRef.current = true;
    props.onStop();
  };

  const handleCancel = () =>
    handlePostRecordCancel({
      onCancel: props.onCancel,
      recordingStatus: props.recordingState.status,
      setIsCancellingStart: state.setIsCancellingStart,
      setIsDiscardingRecording: state.setIsDiscardingRecording,
      setPostRecordRecordingId: state.setPostRecordRecordingId,
      shouldShowPostRecordRef,
    });

  return {
    closePostRecord: () => state.setPostRecordRecordingId(null),
    displayProps,
    handleCancel,
    handleStop,
    postRecordRecordingId: state.postRecordRecordingId,
    showSavingState: state.isDiscardingRecording,
  };
}

function usePostRecordLocalState() {
  const [isCancellingStart, setIsCancellingStart] = useState(false);
  const [isDiscardingRecording, setIsDiscardingRecording] = useState(false);
  const [postRecordRecordingId, setPostRecordRecordingId] = useState<string | null>(null);

  return {
    isCancellingStart,
    isDiscardingRecording,
    postRecordRecordingId,
    setIsCancellingStart,
    setIsDiscardingRecording,
    setPostRecordRecordingId,
  };
}

function usePostRecordEffects(args: PostRecordEffectArgs) {
  usePostRecordVerificationEffect(args);
  useSavedRecordingMessageEffect(args);
}

function usePostRecordVerificationEffect({
  activeRecordingId,
  lastActiveRecordingIdRef,
  recordingStatus,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setPostRecordRecordingId,
  shouldShowPostRecordRef,
  verificationTokenRef,
}: PostRecordEffectArgs) {
  useEffect(() => {
    const recordingId = syncPostRecordState({
      activeRecordingId,
      lastActiveRecordingIdRef,
      recordingStatus,
      setIsCancellingStart,
      setIsDiscardingRecording,
      shouldShowPostRecordRef,
    });
    return recordingId
      ? verifyPostRecordAvailability({
          recordingId,
          setPostRecordRecordingId,
          verificationTokenRef,
        })
      : undefined;
  }, [
    activeRecordingId,
    lastActiveRecordingIdRef,
    recordingStatus,
    setIsCancellingStart,
    setIsDiscardingRecording,
    setPostRecordRecordingId,
    shouldShowPostRecordRef,
    verificationTokenRef,
  ]);
}

function handlePostRecordCancel({
  onCancel,
  recordingStatus,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setPostRecordRecordingId,
  shouldShowPostRecordRef,
}: {
  onCancel: () => void;
  recordingStatus: VideoRecordingStatus;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setPostRecordRecordingId: (value: string | null) => void;
  shouldShowPostRecordRef: MutableRefObject<boolean>;
}): void {
  shouldShowPostRecordRef.current = false;
  setPostRecordRecordingId(null);
  if (isStartInProgress(recordingStatus)) {
    setIsCancellingStart(true);
    setIsDiscardingRecording(false);
    onCancel();
    return;
  }

  setIsDiscardingRecording(true);
  onCancel();
}

function verifyPostRecordAvailability({
  recordingId,
  setPostRecordRecordingId,
  verificationTokenRef,
}: {
  recordingId: string;
  setPostRecordRecordingId: (value: string | null) => void;
  verificationTokenRef: MutableRefObject<number>;
}) {
  const verificationToken = verificationTokenRef.current + 1;
  verificationTokenRef.current = verificationToken;
  let cancelled = false;

  void verifySavedRecordingAvailable(recordingId).then((available) => {
    if (cancelled || verificationTokenRef.current !== verificationToken || !available) {
      return;
    }

    setPostRecordRecordingId(recordingId);
  });

  return () => {
    cancelled = true;
  };
}

function createPostRecordDisplayProps(
  props: VideoSetupPageProps,
  state: {
    isCancellingStart: boolean;
    isDiscardingRecording: boolean;
  }
): VideoSetupPageProps {
  if (!state.isDiscardingRecording && !state.isCancellingStart) {
    return props;
  }

  return {
    ...props,
    isStartPending: state.isDiscardingRecording,
    recordingState: {
      ...props.recordingState,
      countdownEndsAt: null,
      duration: 0,
      error: null,
      status: VideoRecordingStatus.IDLE,
    },
  };
}

function syncPostRecordState({
  activeRecordingId,
  lastActiveRecordingIdRef,
  recordingStatus,
  setIsCancellingStart,
  setIsDiscardingRecording,
  shouldShowPostRecordRef,
}: {
  activeRecordingId: string | null;
  lastActiveRecordingIdRef: MutableRefObject<string | null>;
  recordingStatus: VideoRecordingStatus;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  shouldShowPostRecordRef: MutableRefObject<boolean>;
}): string | null {
  if (recordingStatus !== VideoRecordingStatus.IDLE && activeRecordingId) {
    lastActiveRecordingIdRef.current = activeRecordingId;
  }

  let recordingIdToVerify: string | null = null;
  if (
    recordingStatus === VideoRecordingStatus.IDLE &&
    shouldShowPostRecordRef.current &&
    lastActiveRecordingIdRef.current
  ) {
    recordingIdToVerify = lastActiveRecordingIdRef.current;
    shouldShowPostRecordRef.current = false;
  }

  if (recordingStatus === VideoRecordingStatus.IDLE) {
    setIsCancellingStart(false);
    setIsDiscardingRecording(false);
  }

  return recordingIdToVerify;
}

function isStartInProgress(status: VideoRecordingStatus) {
  return status === VideoRecordingStatus.COUNTDOWN || status === VideoRecordingStatus.PREPARING;
}

async function verifySavedRecordingAvailable(recordingId: string): Promise<boolean> {
  for (let attempt = 0; attempt < POST_RECORD_SAVE_CHECK_ATTEMPTS; attempt += 1) {
    if (await getRecording(recordingId)) {
      return true;
    }

    await delay(POST_RECORD_SAVE_CHECK_DELAY_MS);
  }

  return false;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
