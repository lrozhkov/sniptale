import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Mic, Play, Square } from 'lucide-react';
import { translate } from '../../../../../platform/i18n';

const TEST_RECORDING_MAX_MS = 30_000;
const BUTTON_CLASS_NAME = [
  'inline-flex h-7 w-7 items-center justify-center rounded-[7px] transition-colors',
  'text-[var(--sniptale-color-text-secondary)] hover:bg-[var(--sniptale-color-surface-hover)]',
  'hover:text-[var(--sniptale-color-text-primary)] disabled:pointer-events-none disabled:opacity-45',
].join(' ');

type StartTestRecordingParams = {
  audioUrlRef: MutableRefObject<string | null>;
  chunksRef: MutableRefObject<Blob[]>;
  recorderRef: MutableRefObject<MediaRecorder | null>;
  saveOnStopRef: MutableRefObject<boolean>;
  setAudioUrl: (url: string | null) => void;
  setRecording: (recording: boolean) => void;
  stream: MediaStream | null;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
};

export function MicrophoneTestRecorder({ stream }: { stream: MediaStream | null }) {
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const saveOnStopRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canPlay = audioUrl !== null && !recording;

  useEffect(
    () => () => cleanupTestRecording({ audioUrlRef, recorderRef, saveOnStopRef, timeoutRef }),
    []
  );

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <TestRecorderHeader canPlay={canPlay} recording={recording} />
        <TestRecorderControls
          canPlay={canPlay}
          onPlay={() => {
            void audioRef.current?.play();
          }}
          onRecord={() =>
            startTestRecording({
              chunksRef,
              audioUrlRef,
              recorderRef,
              saveOnStopRef,
              setAudioUrl,
              setRecording,
              stream,
              timeoutRef,
            })
          }
          onStop={() => stopTestRecording({ recorderRef, timeoutRef })}
          recording={recording}
          stream={stream}
        />
      </div>
      {audioUrl ? <audio ref={audioRef} src={audioUrl} /> : null}
    </div>
  );
}

function stopTestRecording({
  recorderRef,
  timeoutRef,
}: {
  recorderRef: MutableRefObject<MediaRecorder | null>;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  clearStopTimer(timeoutRef);
  if (recorderRef.current?.state === 'recording') {
    recorderRef.current.stop();
  }
}

function TestRecorderHeader({ canPlay, recording }: { canPlay: boolean; recording: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-medium text-[var(--sniptale-color-text-muted-strong)]">
        {translate('popup.video.microphoneTestTitle')}
      </div>
      <div className="truncate text-[10px] text-[var(--sniptale-color-text-secondary)]">
        {resolveTestStatusText({ canPlay, recording })}
      </div>
    </div>
  );
}

function TestRecorderControls({
  canPlay,
  onPlay,
  onRecord,
  onStop,
  recording,
  stream,
}: {
  canPlay: boolean;
  onPlay: () => void;
  onRecord: () => void;
  onStop: () => void;
  recording: boolean;
  stream: MediaStream | null;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <IconButton
        disabled={!stream || recording}
        icon={<Mic className="h-3.5 w-3.5" />}
        label={translate('popup.video.microphoneTestRecord')}
        onClick={onRecord}
      />
      <IconButton
        disabled={!recording}
        icon={<Square className="h-3.5 w-3.5" />}
        label={translate('popup.video.microphoneTestStop')}
        onClick={onStop}
      />
      <IconButton
        disabled={!canPlay}
        icon={<Play className="h-3.5 w-3.5" />}
        label={translate('popup.video.microphoneTestPlay')}
        onClick={onPlay}
      />
    </div>
  );
}

function IconButton({
  disabled,
  icon,
  label,
  onClick,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={BUTTON_CLASS_NAME}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {icon}
    </button>
  );
}

function resolveTestStatusText({
  canPlay,
  recording,
}: {
  canPlay: boolean;
  recording: boolean;
}): string {
  if (recording) {
    return translate('popup.video.microphoneTestRecording');
  }
  if (canPlay) {
    return translate('popup.video.microphoneTestReady');
  }
  return translate('popup.video.microphoneTestRecord');
}

function startTestRecording({
  audioUrlRef,
  chunksRef,
  recorderRef,
  saveOnStopRef,
  setAudioUrl,
  setRecording,
  stream,
  timeoutRef,
}: StartTestRecordingParams) {
  if (!stream) {
    return;
  }

  chunksRef.current = [];
  saveOnStopRef.current = true;
  revokeCurrentAudioUrl(audioUrlRef);
  setAudioUrl(null);
  const recorder = new MediaRecorder(stream);
  recorderRef.current = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunksRef.current.push(event.data);
    }
  };
  recorder.onstop = () =>
    handleTestRecordingStop({
      audioUrlRef,
      chunksRef,
      recorder,
      recorderRef,
      saveOnStopRef,
      setAudioUrl,
      setRecording,
      timeoutRef,
    });
  recorder.start();
  setRecording(true);
  timeoutRef.current = setTimeout(() => {
    if (recorder.state === 'recording') {
      recorder.stop();
    }
  }, TEST_RECORDING_MAX_MS);
}

function handleTestRecordingStop({
  audioUrlRef,
  chunksRef,
  recorder,
  recorderRef,
  saveOnStopRef,
  setAudioUrl,
  setRecording,
  timeoutRef,
}: {
  audioUrlRef: MutableRefObject<string | null>;
  chunksRef: MutableRefObject<Blob[]>;
  recorder: MediaRecorder;
  recorderRef: MutableRefObject<MediaRecorder | null>;
  saveOnStopRef: MutableRefObject<boolean>;
  setAudioUrl: (url: string | null) => void;
  setRecording: (recording: boolean) => void;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  clearStopTimer(timeoutRef);
  setRecording(false);
  recorderRef.current = null;
  if (saveOnStopRef.current && chunksRef.current.length > 0) {
    const nextUrl = URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType }));
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
  }
  chunksRef.current = [];
}

function cleanupTestRecording({
  audioUrlRef,
  recorderRef,
  saveOnStopRef,
  timeoutRef,
}: {
  audioUrlRef: MutableRefObject<string | null>;
  recorderRef: MutableRefObject<MediaRecorder | null>;
  saveOnStopRef: MutableRefObject<boolean>;
  timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
}) {
  clearStopTimer(timeoutRef);
  saveOnStopRef.current = false;
  if (recorderRef.current?.state === 'recording') {
    recorderRef.current.stop();
  }
  recorderRef.current = null;
  revokeCurrentAudioUrl(audioUrlRef);
}

function revokeCurrentAudioUrl(audioUrlRef: MutableRefObject<string | null>) {
  if (audioUrlRef.current) {
    URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }
}

function clearStopTimer(timeoutRef: MutableRefObject<ReturnType<typeof setTimeout> | null>) {
  if (timeoutRef.current) {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }
}
