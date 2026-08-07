import { Mic } from 'lucide-react';
import type { CSSProperties } from 'react';
import { usePushToTalk } from '@sniptale/ui/voice-input/use-push-to-talk';
import { isTrustedMouseEvent, isTrustedPointerEvent } from './trusted-events';
import type { VoiceInputState } from './session';

type VoiceInputButtonProps = {
  appearance?: 'contrast' | 'default';
  className?: string;
  dataUi: string;
  disabled: boolean;
  labels: { error: string; start: string; stop: string };
  onStart(): void;
  onStop(): void;
  state: VoiceInputState;
  style?: CSSProperties;
};

function resolveVoiceButtonLabel(props: VoiceInputButtonProps): string {
  if (props.state.errorCode !== null) return props.labels.error;
  return props.state.active ? props.labels.stop : props.labels.start;
}

function getVoiceButtonClassName(props: VoiceInputButtonProps): string {
  const contrast = props.appearance === 'contrast';
  const stateClass = props.state.active
    ? contrast
      ? 'text-[var(--sniptale-color-accent-emphasis)]'
      : 'text-[var(--sniptale-color-accent)]'
    : props.state.errorCode !== null
      ? 'text-[var(--sniptale-color-danger)]'
      : contrast
        ? 'text-[var(--sniptale-color-text-inverse)] hover:bg-[var(--sniptale-color-surface-contrast-hover)]'
        : 'text-[var(--sniptale-color-text-dim)] hover:text-[var(--sniptale-color-text-primary)]';
  return [
    'relative inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-full',
    'border transition-colors focus-visible:outline-none focus-visible:ring-2',
    'focus-visible:ring-[var(--sniptale-color-accent)]',
    props.disabled
      ? 'disabled:cursor-not-allowed disabled:opacity-45'
      : 'disabled:cursor-pointer disabled:opacity-100',
    contrast
      ? [
          'border-[color:color-mix(in_srgb,var(--sniptale-color-text-inverse)_26%,transparent)]',
          'bg-[var(--sniptale-color-surface-contrast)]',
          'shadow-[0_3px_10px_rgba(0,0,0,0.45)]',
        ].join(' ')
      : 'border-transparent',
    stateClass,
    props.className,
  ]
    .filter(Boolean)
    .join(' ');
}

function VoiceInputActivity(props: { contrast: boolean; level: number }) {
  return (
    <span
      aria-hidden="true"
      className={[
        'pointer-events-none absolute inset-1 rounded-full transition-transform',
        'motion-reduce:transition-none',
        props.contrast
          ? 'border border-[var(--sniptale-color-accent-emphasis)] shadow-[0_0_7px_var(--sniptale-color-accent-glow)]'
          : 'border border-[var(--sniptale-color-accent)]',
      ].join(' ')}
      style={{
        opacity: props.contrast ? 0.82 + props.level * 0.18 : 0.45 + props.level * 0.45,
        transform: `scale(${1 + props.level * 0.4})`,
      }}
    />
  );
}

export function VoiceInputButton(props: VoiceInputButtonProps) {
  const pushToTalk = usePushToTalk({
    active: props.state.active,
    disabled: props.disabled,
    onStart: props.onStart,
    onStop: props.onStop,
  });
  const stopping = props.state.phase === 'stopping';
  const contrast = props.appearance === 'contrast';
  const label = resolveVoiceButtonLabel(props);
  const level = Math.max(0, Math.min(props.state.audioLevel, 1));

  return (
    <button
      aria-label={label}
      aria-pressed={props.state.active}
      className={getVoiceButtonClassName(props)}
      data-ui={props.dataUi}
      disabled={props.disabled || stopping}
      style={props.style}
      title={label}
      type="button"
      onClick={(event) => {
        if (event.detail !== 0) return;
        if (props.state.active) props.onStop();
        else if (isTrustedMouseEvent(event.nativeEvent)) props.onStart();
      }}
      onPointerCancel={pushToTalk.onPointerCancel}
      onPointerDown={(event) => {
        if (props.state.active) {
          if (event.button === 0) props.onStop();
          return;
        }
        if (!isTrustedPointerEvent(event.nativeEvent)) return;
        pushToTalk.onPointerDown(event);
      }}
      onPointerUp={pushToTalk.onPointerUp}
    >
      {props.state.active ? <VoiceInputActivity contrast={contrast} level={level} /> : null}
      <Mic aria-hidden="true" size={14} strokeWidth={1.8} />
    </button>
  );
}
