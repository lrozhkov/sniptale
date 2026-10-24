import { CommandPressScope } from '@sniptale/ui/control-language/press';
import { InspectorFieldClear } from '../../ui/compact-inspector-controls/text-field';
import { useContext, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import { ProductInput, ProductTextarea } from '@sniptale/ui/product-form-controls';
import { X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { VoiceInputButton } from '../../composition/voice-input/button';
import { useVoiceInputSession } from '../../composition/voice-input/session';
import { translate } from '../../platform/i18n';
import { GUIDE_LIMITS } from '@sniptale/runtime-contracts/scenario/types/guide';

type VoiceFieldProps = {
  'aria-label': string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
  formControl?: boolean;
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
  const cancelVoice = voice.actions.cancel;
  const cancel = () => {
    insertion.current = null;
    caret.current = null;
    cancelVoice();
  };
  useEffect(() => {
    if (props.disabled) {
      insertion.current = null;
      cancelVoice();
    }
  }, [props.disabled, cancelVoice]);
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
      cancel();
      latest.current = { ...latest.current, value: event.target.value };
      props.onValueChange(event.target.value);
    },
    onSelect: () => {
      if (voice.state.pending) {
        cancel();
        return;
      }
      if (!insertion.current || !field.current) return;
      insertion.current.start = field.current.selectionStart ?? props.value.length;
      insertion.current.end = field.current.selectionEnd ?? props.value.length;
    },
  };
  return {
    bindings,
    field,
    voice,
    cancel,
    stop: voice.actions.stop,
    clear() {
      if (latest.current.disabled) return;
      cancel();
      latest.current = { ...latest.current, value: '' };
      caret.current = 0;
      props.onValueChange('');
      field.current?.focus({ preventScroll: true });
    },
    start() {
      if (latest.current.disabled || !field.current || voice.state.active || voice.state.pending)
        return;
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
  const compact = useContext(CommandPressScope);
  const { bindings, field, voice, stop, cancel, start, clear } = useGuideVoiceField(props);
  const Input = props.formControl ? ProductInput : 'input';
  const Textarea = props.formControl ? ProductTextarea : 'textarea';
  const attributes = {
    'aria-label': props['aria-label'],
    className: props.className,
    disabled: props.disabled,
    maxLength: props.maxLength ?? GUIDE_LIMITS.maxTextLength,
    placeholder:
      props.placeholder ??
      (props.singleLine || props.formControl ? props['aria-label'] : undefined),
    style: props.style,
    value: props.value,
    ...bindings,
  };
  return (
    <span
      className="guide-voice-field"
      data-voice-visible={
        voice.state.active || voice.state.pending || voice.state.errorCode !== null || undefined
      }
      data-clearable={(compact && props.clearable !== false) || undefined}
      data-single-line={props.singleLine || undefined}
      onClickCapture={(event) => {
        if (
          compact &&
          event.target instanceof Element &&
          event.target.closest('.sniptale-field-clear')
        )
          cancel();
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) cancel();
      }}
    >
      {props.singleLine ? (
        <Input {...attributes} />
      ) : (
        <Textarea {...attributes} rows={props.rows ?? 1} />
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
          onCancel={cancel}
        />
        {!compact && props.clearable && (
          <ContentToolbarButton
            tone="close"
            title={translate('scenario.editor.guideClearText')}
            className="guide-text-clear"
            disabled={props.disabled || !props.value}
            onClick={clear}
          >
            <X size={14} aria-hidden="true" />
          </ContentToolbarButton>
        )}
      </span>
      {compact && props.clearable !== false && !props.disabled && props.value ? (
        <InspectorFieldClear label={props['aria-label']} target={field} />
      ) : null}
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
  const spoken = current.singleLine ? transcript.replace(/[\r\n]+/g, ' ') : transcript;
  const before = current.value.slice(0, start);
  const after = current.value.slice(end);
  const leading = transcriptSeparator(before, spoken);
  const trailing = transcriptSeparator(spoken, after);
  const text = spoken.slice(0, Math.max(0, available - leading.length - trailing.length));
  if (!text) return null;
  return {
    value: before + leading + text + trailing + after,
    caret: start + leading.length + text.length,
  };
}

/** Adds word boundaries without rewriting existing whitespace or dictated punctuation. */
function transcriptSeparator(before: string, after: string): string {
  return /[\p{L}\p{N}\p{M})\]}»”"'.!?…,:;]$/u.test(before) && /^[\p{L}\p{N}\p{M}([{«“]/u.test(after)
    ? ' '
    : '';
}
