import { useEffect, useLayoutEffect, useRef } from 'react';
import { ProductTextarea } from '@sniptale/ui/product-form-controls';
import { VoiceInputButton } from '../../composition/voice-input/button';
import { useVoiceInputSession } from '../../composition/voice-input/session';
import { getVoiceInputProviderErrorKey } from '../../composition/voice-input/provider-error-copy';
import { translate } from '../../platform/i18n';

/** Binds shared dictation to this prompt and cancels insertion after manual edits or task changes. */
export function ImagePrompt(props: {
  operationId: string;
  value: string;
  refining: boolean;
  voiceDisabled: boolean;
  onChange(value: string): void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const insertion = useRef<{ start: number; end: number; sequence: number } | null>(null);
  const caret = useRef<number | null>(null);
  const voice = useVoiceInputSession({
    onTranscript(event) {
      const range = insertion.current;
      const current = latest.current;
      if (!range || current.voiceDisabled || !event.isFinal || event.sequence <= range.sequence)
        return;
      range.sequence = event.sequence;
      const start = Math.min(range.start, current.value.length);
      const end = Math.max(start, Math.min(range.end, current.value.length));
      const before = current.value.slice(0, start);
      const after = current.value.slice(end);
      const leading = before && !/\s$/u.test(before) ? ' ' : '';
      const trailing = after && !/^\s/u.test(after) ? ' ' : '';
      const text = event.text
        .trim()
        .slice(
          0,
          Math.max(0, 4000 - before.length - after.length - leading.length - trailing.length)
        );
      if (!text) return;
      const value = before + leading + text + trailing + after;
      range.start = range.end = before.length + leading.length + text.length;
      caret.current = range.start;
      latest.current = { ...current, value };
      current.onChange(value);
    },
  });
  const cancelVoice = voice.actions.cancel;
  useEffect(() => {
    insertion.current = null;
    caret.current = null;
    cancelVoice();
  }, [props.operationId, props.voiceDisabled, cancelVoice]);
  useLayoutEffect(() => {
    if (caret.current === null) return;
    field.current?.setSelectionRange(caret.current, caret.current);
    caret.current = null;
  }, [props.value]);
  const cancel = () => {
    insertion.current = null;
    caret.current = null;
    cancelVoice();
  };
  return (
    <div
      className="relative w-full"
      data-ui="editor.ai.prompt-field"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) cancel();
      }}
    >
      <div className="relative">
        <ProductTextarea
          ref={field}
          rows={3}
          maxLength={4000}
          value={props.value}
          aria-label={translate('editor.ai.prompt')}
          placeholder={translate(props.refining ? 'editor.ai.refine' : 'editor.ai.prompt')}
          onChange={(event) => {
            cancel();
            latest.current = { ...latest.current, value: event.currentTarget.value };
            props.onChange(event.currentTarget.value);
          }}
          onSelect={() => {
            if (voice.state.pending) {
              cancel();
              return;
            }
            if (insertion.current && field.current) {
              insertion.current.start = field.current.selectionStart;
              insertion.current.end = field.current.selectionEnd;
            }
          }}
          className={[
            'block w-full resize-y !pb-8 !pr-9 focus:!border-[var(--sniptale-color-border-strong)]',
            'focus:!shadow-none',
            'selection:bg-[color-mix(in_srgb,var(--sniptale-color-text-secondary)_22%,transparent)]',
            'selection:text-[var(--sniptale-color-text-primary)]',
          ].join(' ')}
          data-ui="editor.ai.prompt"
        />
        <span className="absolute bottom-1 right-1" onMouseDown={(event) => event.preventDefault()}>
          <VoiceInputButton
            dataUi="editor.ai.voice"
            className="!h-6 !w-6 !rounded-[4px] !border-transparent !bg-transparent"
            disabled={props.voiceDisabled}
            state={voice.state}
            labels={{
              start: translate('editor.ai.voiceStart'),
              stop: translate('editor.ai.voiceStop'),
              error: translate('editor.ai.voiceFailed'),
            }}
            onStart={() => {
              if (
                props.voiceDisabled ||
                !field.current ||
                voice.state.active ||
                voice.state.pending
              )
                return;
              field.current.focus({ preventScroll: true });
              insertion.current = {
                start: field.current.selectionStart,
                end: field.current.selectionEnd,
                sequence: -1,
              };
              void voice.actions.start();
            }}
            onStop={voice.actions.stop}
            onCancel={cancel}
          />
        </span>
      </div>
      {voice.state.errorCode ? (
        <p role="alert" className="mt-1 text-xs text-[var(--sniptale-color-danger)]">
          {translate(
            getVoiceInputProviderErrorKey(voice.state.errorCode) ?? 'editor.ai.voiceFailed'
          )}
        </p>
      ) : null}
    </div>
  );
}
