import { Pause, Play, RotateCcw, SquarePen, X } from 'lucide-react';
import { useEffect, useId, useCallback, useRef, useState, type RefObject } from 'react';
import { translate } from '../../platform/i18n';
import { CameraWindowButton } from './button';
import { TeleprompterReader, type ReadingPreferences } from './teleprompter-reader';
import { TeleprompterSettings, type PlaybackMode } from './teleprompter-settings';

const SECTION_CLASS = [
  'flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto',
  'text-[var(--sniptale-color-text-primary)]',
].join(' ');
const EDITOR_CLASS = [
  'min-h-20 w-full flex-1 resize-y rounded-[4px] border border-transparent bg-transparent p-2',
  '[font-family:var(--sniptale-font-document-sans)] text-[16px] leading-relaxed',
  'hover:border-[var(--sniptale-color-border-soft)] hover:bg-[var(--sniptale-color-surface-panel)]',
  'focus:border-[var(--sniptale-color-border-soft)] focus:bg-[var(--sniptale-color-surface-panel)]',
  'focus:placeholder:text-transparent',
].join(' ');
/** A session-local script reader. The host retains the mounted component when hidden. */
export function Teleprompter({
  paused,
  recordingId = null,
  onHide,
  visible = true,
}: {
  paused: boolean;
  visible?: boolean;
  onHide?: () => void;
  recordingId?: string | null;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(true);
  const [speed, setSpeed] = useState(140);
  const [preferences, setPreferences] = useState<ReadingPreferences>({
    fontSize: null,
    columnWidth: null,
    focusGuide: false,
  });
  const [effectiveFontSize, setEffectiveFontSize] = useState(24);
  const [playback, setPlayback] = useState<PlaybackMode>('manual');
  const section = useRef<HTMLElement>(null);
  const scroll = useTeleprompterScroll({
    paused: paused || !visible,
    editing,
    speed,
    section,
    recordingId,
    playback,
    text,
    onRead: () => setEditing(false),
  });
  return (
    <section
      ref={section}
      aria-label={translate('popup.video.teleprompterTitle')}
      className={SECTION_CLASS}
    >
      <div className="camera-teleprompter-header flex shrink-0 items-center justify-between gap-2">
        {!editing ? (
          <PlaybackControls
            running={scroll.running}
            manuallyPaused={scroll.manuallyPaused}
            paused={paused}
            onToggle={scroll.toggle}
            onReset={scroll.reset}
          />
        ) : null}
        <div className="ms-auto flex min-w-0 items-center gap-2">
          <div className={!editing ? 'camera-teleprompter-mode' : undefined}>
            <CameraWindowButton
              responsiveLabel
              icon={SquarePen}
              label={translate(
                editing ? 'popup.video.teleprompterRead' : 'popup.video.teleprompterEdit'
              )}
              disabled={editing && !text.trim()}
              onClick={() => {
                if (!editing) scroll.pause();
                setEditing(!editing);
              }}
            />
          </div>
          <TeleprompterSettings
            id={id}
            visible={visible}
            paused={paused}
            speed={speed}
            fontSize={preferences.fontSize ?? effectiveFontSize}
            preferences={preferences}
            playback={playback}
            onPlaybackChange={setPlayback}
            onPreferencesChange={(change) => {
              scroll.pause();
              setPreferences((previous) => ({ ...previous, ...change }));
            }}
            onSpeedChange={setSpeed}
          />
          {onHide ? (
            <CameraWindowButton
              icon={X}
              iconOnly
              label={translate('popup.video.teleprompterHide')}
              onClick={() => {
                scroll.pause();
                onHide();
              }}
            />
          ) : null}
        </div>
      </div>
      {editing ? (
        <div className="flex min-h-0 flex-1 flex-col gap-1">
          <span
            id={`${id}-script`}
            className="text-[12px] text-[var(--sniptale-color-text-secondary)]"
          >
            {translate('popup.video.teleprompterScript')}
          </span>
          <textarea
            aria-labelledby={`${id}-script`}
            className={EDITOR_CLASS}
            placeholder={translate('popup.video.teleprompterPlaceholder')}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
      ) : (
        <TeleprompterReader
          reader={scroll.reader}
          text={text}
          preferences={preferences}
          onPause={scroll.pause}
          onFontSize={setEffectiveFontSize}
        />
      )}
      {paused ? (
        <p className="sr-only">{translate('popup.video.teleprompterRecordingPaused')}</p>
      ) : null}
    </section>
  );
}

function PlaybackControls(props: {
  running: boolean;
  manuallyPaused: boolean;
  paused: boolean;
  onToggle: () => void;
  onReset: () => void;
}) {
  const label = props.running
    ? 'popup.video.teleprompterPause'
    : props.manuallyPaused
      ? 'popup.video.teleprompterResume'
      : 'popup.video.teleprompterPlay';
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="camera-teleprompter-play">
        <CameraWindowButton
          responsiveLabel
          icon={props.running ? Pause : Play}
          label={translate(label)}
          disabled={props.paused}
          onClick={props.onToggle}
        />
      </div>
      <div className="camera-teleprompter-reset">
        <CameraWindowButton
          responsiveLabel
          icon={RotateCcw}
          label={translate('popup.video.teleprompterReset')}
          onClick={props.onReset}
        />
      </div>
    </div>
  );
}

function useTeleprompterScroll({
  paused,
  editing,
  speed,
  section,
  recordingId,
  playback,
  text,
  onRead,
}: {
  paused: boolean;
  editing: boolean;
  speed: number;
  section: RefObject<HTMLElement | null>;
  recordingId: string | null;
  playback: PlaybackMode;
  text: string;
  onRead: () => void;
}) {
  const reader = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const running = playing && !paused && !editing;
  const seenRecording = useRef<string | null>(null);
  const seenPlayback = useRef(playback);
  const pendingStart = useRef<{ rewind: boolean } | null>(null);
  const playingIntent = useRef(playing);
  playingIntent.current = playing;
  const pause = useCallback(() => {
    if (playingIntent.current || pendingStart.current) setManuallyPaused(true);
    pendingStart.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => {
    const newRecording = seenRecording.current !== recordingId;
    const changedMode = seenPlayback.current !== playback;
    seenRecording.current = recordingId;
    seenPlayback.current = playback;
    if (newRecording) {
      pendingStart.current = recordingId && playback === 'recording' ? { rewind: true } : null;
      setPlaying(false);
      setManuallyPaused(false);
    }
    if (changedMode) {
      if (playback === 'manual') pause();
      else if (recordingId && !newRecording) pendingStart.current = { rewind: false };
    }
    const start = pendingStart.current;
    if (!start || paused) return;
    pendingStart.current = null;
    if (!text.trim()) return;
    if (start.rewind && reader.current) reader.current.scrollTop = 0;
    onRead();
    setManuallyPaused(false);
    setPlaying(true);
  }, [recordingId, paused, playback, text, onRead, pause]);

  useEffect(() => {
    const surface = section.current?.closest('[data-recording-surface]');
    surface?.addEventListener('sniptale-recording-surface-change', pause);
    return () => surface?.removeEventListener('sniptale-recording-surface-change', pause);
  }, [section, pause]);

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let frameWindow: Window | null = null;
    let previous: number | null = null;
    let position = reader.current?.scrollTop ?? 0;
    const words = Math.max(1, text.match(/\S+/gu)?.length ?? 0);
    const schedule = () => {
      frameWindow = reader.current?.ownerDocument.defaultView ?? window;
      frame = frameWindow.requestAnimationFrame(tick);
    };
    const tick = (timestamp: number) => {
      const element = reader.current;
      if (!element || element.closest('[hidden]')) {
        pause();
        return;
      }
      const end = Math.max(0, element.scrollHeight - element.clientHeight);
      const column = element.querySelector<HTMLElement>('[data-teleprompter-column]');
      const height =
        column?.getBoundingClientRect().height || column?.scrollHeight || element.scrollHeight;
      const pixelsPerSecond = (speed * height) / (60 * words);
      if (previous !== null)
        position += (Math.max(0, timestamp - previous) * pixelsPerSecond) / 1000;
      previous = timestamp;
      element.scrollTop = Math.min(position, end);
      if (position >= end) {
        setPlaying(false);
        setManuallyPaused(false);
        return;
      }
      schedule();
    };
    schedule();
    return () => frameWindow?.cancelAnimationFrame(frame);
  }, [running, speed, text, pause, recordingId]);
  return {
    reader,
    running,
    manuallyPaused,
    pause,
    toggle: () => {
      if (running) pause();
      else {
        pendingStart.current = null;
        setManuallyPaused(false);
        setPlaying(true);
      }
    },
    reset: () => {
      pause();
      setManuallyPaused(false);
      if (reader.current) reader.current.scrollTop = 0;
    },
  };
}
