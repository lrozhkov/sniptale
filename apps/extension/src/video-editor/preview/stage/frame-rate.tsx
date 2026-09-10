import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { translate } from '../../../platform/i18n';

/** Stage-local counters; no frame buffers or per-frame React updates. */
export function createPreviewFrameRateCounter(now: () => number = () => performance.now()) {
  let started = now();
  let frames = 0;
  return {
    record() {
      frames += 1;
    },
    reset() {
      started = now();
      frames = 0;
    },
    sample() {
      const time = now();
      const rate = time > started ? Math.round((frames * 1000) / (time - started)) : 0;
      started = time;
      frames = 0;
      return rate;
    },
  };
}

interface FrameRateState {
  enabled: boolean;
  playing: boolean;
  record(): void;
  counter: ReturnType<typeof createPreviewFrameRateCounter>;
  onChange(value: boolean): void;
}
const FrameRateContext = createContext<FrameRateState | null>(null);

export function PreviewFrameRateProvider(props: {
  children: ReactNode;
  enabled: boolean;
  live: boolean;
  playing: boolean;
  onChange(value: boolean): void;
}) {
  const counter = useMemo(() => createPreviewFrameRateCounter(), []);
  const active = props.enabled && props.live && props.playing;
  useLayoutEffect(() => counter.reset(), [counter, active]);
  const record = useCallback(() => {
    if (active) counter.record();
  }, [active, counter]);
  const value = useMemo(
    () => ({
      counter,
      record,
      enabled: props.enabled,
      playing: props.playing,
      onChange: props.onChange,
    }),
    [counter, record, props.enabled, props.playing, props.onChange]
  );
  return <FrameRateContext.Provider value={value}>{props.children}</FrameRateContext.Provider>;
}

export function usePreviewFrameRate() {
  return useContext(FrameRateContext);
}

export function PreviewFrameRateReadout() {
  const state = usePreviewFrameRate();
  return state?.enabled ? <FrameRateReadout state={state} /> : null;
}

function FrameRateReadout({ state }: { state: FrameRateState }) {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    setRate(null);
    if (!state.playing) return;
    const timer = setInterval(() => setRate(state.counter.sample()), 500);
    return () => clearInterval(timer);
  }, [state.counter, state.playing]);
  return (
    <span
      data-ui="video.preview.actual-fps"
      title={translate('videoEditor.stage.actualFrameRate')}
      className={[
        'inline-flex h-9 min-w-[6ch] items-center justify-end whitespace-nowrap text-xs tabular-nums',
        'text-[var(--sniptale-color-text-muted)]',
      ].join(' ')}
    >
      {state.playing && rate !== null ? rate : '—'} FPS
    </span>
  );
}
