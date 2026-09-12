import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { VoiceInputButton } from '../../composition/voice-input/button';
import { useVoiceInputSession } from '../../composition/voice-input/session';
import { translate } from '../../platform/i18n';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';

type VoiceFieldProps = {
  'aria-label': string;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
  placeholder?: string;
  rows?: number;
  singleLine?: boolean;
  style?: CSSProperties;
  value: string;
  onValueChange(value: string): void;
};

/** Owns the field-bound insertion point and shared session lifecycle. */
function useGuideVoiceField(props: VoiceFieldProps) {
  const field = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const insertion = useRef<{ start: number; end: number; sequence: number } | null>(null);
  const caret = useRef<number | null>(null);
  const voice = useVoiceInputSession({
    onTranscript(event) {
      const target = insertion.current;
      const current = latest.current;
      if (!target || current.disabled || !event.isFinal || event.sequence <= target.sequence)
        return;
      target.sequence = event.sequence;
      const result = insertTranscript(current, target, event.text);
      if (!result) return;
      const { value, caret: nextCaret } = result;
      target.start = nextCaret;
      target.end = target.start;
      caret.current = target.start;
      latest.current = { ...current, value };
      current.onValueChange(value);
    },
  });
  const stopVoice = voice.actions.stop;
  const stop = () => {
    insertion.current = null;
    caret.current = null;
    stopVoice();
  };
  useEffect(() => {
    if (props.disabled) {
      insertion.current = null;
      stopVoice();
    }
  }, [props.disabled, stopVoice]);
  useLayoutEffect(() => {
    if (caret.current === null) return;
    field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [props.value]);
  const bindings = {
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      field.current = node;
    },
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      latest.current = { ...latest.current, value: event.target.value };
      props.onValueChange(event.target.value);
    },
    onSelect: () => {
      if (!insertion.current || !field.current) return;
      insertion.current.start = field.current.selectionStart ?? props.value.length;
      insertion.current.end = field.current.selectionEnd ?? props.value.length;
    },
  };
  return {
    bindings,
    voice,
    stop,
    start() {
      if (latest.current.disabled || !field.current) return;
      field.current.focus({ preventScroll: true });
      insertion.current = {
        start: field.current.selectionStart ?? latest.current.value.length,
        end: field.current.selectionEnd ?? latest.current.value.length,
        sequence: -1,
      };
      void voice.actions.start();
    },
  };
}

/** Presents one compact microphone without covering the editable field or its block controls. */
export function GuideVoiceField(props: VoiceFieldProps) {
  const { bindings, voice, stop, start } = useGuideVoiceField(props);
  const attributes = {
    'aria-label': props['aria-label'],
    className: props.className,
    disabled: props.disabled,
    maxLength: props.maxLength ?? GUIDE_LIMITS.maxTextLength,
    placeholder: props.placeholder,
    style: props.style,
    value: props.value,
    ...bindings,
  };
  return (
    <span
      className="guide-voice-field"
      data-voice-visible={voice.state.active || voice.state.errorCode !== null || undefined}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) stop();
      }}
    >
      {props.singleLine ? (
        <input {...attributes} />
      ) : (
        <textarea {...attributes} rows={props.rows ?? 1} />
      )}
      <span className="guide-voice-control" onMouseDown={(event) => event.preventDefault()}>
        <VoiceInputButton
          dataUi="scenario.voice-input"
          disabled={props.disabled ?? false}
          state={voice.state}
          labels={{
            start: translate('scenario.editor.guideVoiceStart'),
            stop: translate('scenario.editor.guideVoiceStop'),
            error: translate('scenario.editor.guideVoiceError'),
          }}
          onStart={start}
          onStop={stop}
        />
      </span>
    </span>
  );
}

/** Pure text replacement shares the field limit without mutating the session or document. */
function insertTranscript(
  current: Pick<VoiceFieldProps, 'value' | 'maxLength' | 'singleLine'>,
  target: { start: number; end: number },
  transcript: string
) {
  const start = Math.min(target.start, current.value.length);
  const end = Math.max(start, Math.min(target.end, current.value.length));
  const available = Math.max(
    0,
    (current.maxLength ?? GUIDE_LIMITS.maxTextLength) - current.value.length + end - start
  );
  const text = (current.singleLine ? transcript.replace(/[\r\n]+/g, ' ') : transcript).slice(
    0,
    available
  );
  if (!text) return null;
  return {
    value: current.value.slice(0, start) + text + current.value.slice(end),
    caret: start + text.length,
  };
}
