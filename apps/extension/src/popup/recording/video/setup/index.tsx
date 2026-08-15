import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { VideoRecordingStatus } from '@sniptale/runtime-contracts/video/types/types';
import { translate } from '../../../../platform/i18n/popup';
import { VideoSetupFooter } from '../footer';
import {
  acknowledgeVideoPostRecordResult,
  loadPendingVideoPostRecordResult,
} from '../post-record/result-runtime';
import { VideoSetupBody } from './body';
import type { VideoSetupPageProps } from './types';
import { getVideoSetupViewModel } from './view-model';

type PostRecordEffectArgs = {
  activeRecordingId: string | null;
  recordingStatus: VideoRecordingStatus;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setFailedVerificationKey: (value: string | null) => void;
  setPostRecordResult: (value: VideoPostRecordResult | null) => void;
  setVerifiedRecordingKey: (value: string) => void;
  shouldVerify: boolean;
  verificationAttempt: number;
  verificationKey: string;
  verificationTokenRef: MutableRefObject<number>;
};

export default function VideoSetupPage(props: VideoSetupPageProps) {
  const postRecord = useVideoPostRecordState(props);
  const viewModel = getVideoSetupViewModel(postRecord.displayProps);
  const footer =
    postRecord.postRecordResult ||
    postRecord.isVerificationPending ||
    postRecord.hasVerificationError ? null : (
      <VideoSetupFooter
        canStart={viewModel.canStart}
        startButtonLabel={viewModel.startButtonLabel}
        startDisabledReason={viewModel.startDisabledReason}
        onStart={props.onStart}
        onPauseResume={props.onPauseResume}
        onStop={props.onStop}
        onCancel={postRecord.handleCancel}
        recordingState={postRecord.displayProps.recordingState}
        galleryTitle={viewModel.galleryTitle}
      />
    );
  const isIdle = postRecord.displayProps.recordingState.status === VideoRecordingStatus.IDLE;

  return (
    <div className="flex h-full flex-col gap-3">
      {postRecord.hasVerificationError ? (
        <PostRecordVerificationError onRetry={postRecord.retryVerification} />
      ) : (
        <VideoSetupBody
          {...postRecord.displayProps}
          postRecordResult={postRecord.postRecordResult}
          onAcknowledgePostRecord={postRecord.acknowledgePostRecord}
          showSavingState={postRecord.showSavingState}
          viewModel={viewModel}
          idleActions={isIdle ? footer : null}
        />
      )}
      {isIdle ? null : footer}
    </div>
  );
}

function useVideoPostRecordState(props: VideoSetupPageProps) {
  const postRecordVerificationTokenRef = useRef(0);
  const verificationKey = createPostRecordVerificationKey(props);
  const state = usePostRecordLocalState(
    props.initialPostRecordResult ?? null,
    props.initialPostRecordVerified === true ? verificationKey : null
  );
  const displayProps = createPostRecordDisplayProps(props, state);
  const hasVerificationError = state.failedVerificationKey === verificationKey;
  const isVerificationPending =
    state.verifiedRecordingKey !== verificationKey && !hasVerificationError;
  const verifiedPostRecordResult = isVerificationPending ? null : state.postRecordResult;

  usePostRecordResultEffect({
    activeRecordingId: props.activeRecordingId,
    recordingStatus: props.recordingState.status,
    setIsCancellingStart: state.setIsCancellingStart,
    setIsDiscardingRecording: state.setIsDiscardingRecording,
    setFailedVerificationKey: state.setFailedVerificationKey,
    setPostRecordResult: state.setPostRecordResult,
    setVerifiedRecordingKey: state.setVerifiedRecordingKey,
    shouldVerify: state.verifiedRecordingKey !== verificationKey,
    verificationAttempt: state.verificationAttempt,
    verificationKey,
    verificationTokenRef: postRecordVerificationTokenRef,
  });

  const handleCancel = () =>
    handlePostRecordCancel({
      onCancel: props.onCancel,
      recordingStatus: props.recordingState.status,
      setIsCancellingStart: state.setIsCancellingStart,
      setIsDiscardingRecording: state.setIsDiscardingRecording,
      setPostRecordResult: state.setPostRecordResult,
    });

  const acknowledgePostRecord = async () => {
    const result = state.postRecordResult;
    if (!result) {
      return;
    }
    const acknowledgement = await acknowledgeVideoPostRecordResult(result.recordingId);
    state.setPostRecordResult(
      acknowledgement === 'stale' ? await loadPendingVideoPostRecordResult() : null
    );
  };

  return {
    acknowledgePostRecord,
    displayProps,
    handleCancel,
    hasVerificationError,
    isVerificationPending,
    postRecordResult: verifiedPostRecordResult,
    retryVerification: () => {
      state.setFailedVerificationKey(null);
      state.setVerificationAttempt((attempt) => attempt + 1);
    },
    showSavingState: state.isDiscardingRecording,
  };
}

function usePostRecordLocalState(
  initialPostRecordResult: VideoPostRecordResult | null,
  initialVerifiedRecordingKey: string | null
) {
  const [isCancellingStart, setIsCancellingStart] = useState(false);
  const [isDiscardingRecording, setIsDiscardingRecording] = useState(false);
  const [failedVerificationKey, setFailedVerificationKey] = useState<string | null>(null);
  const [postRecordResult, setPostRecordResult] = useState<VideoPostRecordResult | null>(
    initialPostRecordResult
  );
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [verifiedRecordingKey, setVerifiedRecordingKey] = useState<string | null>(
    initialVerifiedRecordingKey
  );

  return {
    failedVerificationKey,
    isCancellingStart,
    isDiscardingRecording,
    postRecordResult,
    setFailedVerificationKey,
    setIsCancellingStart,
    setIsDiscardingRecording,
    setPostRecordResult,
    setVerificationAttempt,
    setVerifiedRecordingKey,
    verificationAttempt,
    verifiedRecordingKey,
  };
}

function usePostRecordResultEffect({
  activeRecordingId,
  recordingStatus,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setFailedVerificationKey,
  setPostRecordResult,
  setVerifiedRecordingKey,
  shouldVerify,
  verificationAttempt,
  verificationKey,
  verificationTokenRef,
}: PostRecordEffectArgs) {
  useEffect(() => {
    if (recordingStatus === VideoRecordingStatus.IDLE) {
      setIsCancellingStart(false);
      setIsDiscardingRecording(false);
    }

    const verificationToken = verificationTokenRef.current + 1;
    verificationTokenRef.current = verificationToken;
    if (activeRecordingId !== null) {
      setFailedVerificationKey(null);
      setPostRecordResult(null);
      setVerifiedRecordingKey(verificationKey);
      return;
    }
    if (!shouldVerify) {
      return;
    }

    let cancelled = false;
    void loadPendingVideoPostRecordResult()
      .then((result) => {
        if (!cancelled && verificationTokenRef.current === verificationToken) {
          setFailedVerificationKey(null);
          setPostRecordResult(result);
          setVerifiedRecordingKey(verificationKey);
        }
      })
      .catch(() => {
        if (!cancelled && verificationTokenRef.current === verificationToken) {
          setFailedVerificationKey(verificationKey);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeRecordingId,
    recordingStatus,
    setIsCancellingStart,
    setIsDiscardingRecording,
    setFailedVerificationKey,
    setPostRecordResult,
    setVerifiedRecordingKey,
    shouldVerify,
    verificationAttempt,
    verificationKey,
    verificationTokenRef,
  ]);
}

function PostRecordVerificationError({ onRetry }: { onRetry: () => void }) {
  return (
    <section
      className={[
        'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-[16px] border p-4 text-center',
        'border-[var(--sniptale-color-danger-soft)] bg-[var(--sniptale-color-surface-canvas)]',
      ].join(' ')}
      role="alert"
    >
      <p className="text-xs text-[var(--sniptale-color-danger)]">
        {translate('popup.video.postRecordLoadError')}
      </p>
      <button
        className={[
          'inline-flex h-9 items-center justify-center rounded-[10px] px-4 text-xs font-semibold',
          'bg-[var(--sniptale-color-accent)] text-white transition-opacity hover:opacity-90',
        ].join(' ')}
        type="button"
        onClick={onRetry}
      >
        {translate('popup.video.postRecordRetry')}
      </button>
    </section>
  );
}

function createPostRecordVerificationKey(props: VideoSetupPageProps): string {
  return props.activeRecordingId ?? 'none';
}

function handlePostRecordCancel({
  onCancel,
  recordingStatus,
  setIsCancellingStart,
  setIsDiscardingRecording,
  setPostRecordResult,
}: {
  onCancel: () => void;
  recordingStatus: VideoRecordingStatus;
  setIsCancellingStart: (value: boolean) => void;
  setIsDiscardingRecording: (value: boolean) => void;
  setPostRecordResult: (value: VideoPostRecordResult | null) => void;
}): void {
  setPostRecordResult(null);
  if (isStartInProgress(recordingStatus)) {
    setIsCancellingStart(true);
    setIsDiscardingRecording(false);
    onCancel();
    return;
  }

  setIsDiscardingRecording(true);
  onCancel();
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

function isStartInProgress(status: VideoRecordingStatus) {
  return status === VideoRecordingStatus.COUNTDOWN || status === VideoRecordingStatus.PREPARING;
}
