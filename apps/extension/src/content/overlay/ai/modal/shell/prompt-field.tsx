import {
  useId,
  useLayoutEffect,
  type Dispatch,
  type KeyboardEvent,
  type MouseEvent,
  type Ref,
  type RefObject,
  type SetStateAction,
} from 'react';

import { translate } from '../../../../../platform/i18n';
import { ProductField, ProductTextarea } from '@sniptale/ui/product-form-controls';
import { CornerDownLeft } from 'lucide-react';
import type { useAIModalState } from '../session';
import { AIModalPromptVoiceButton } from './prompt-voice-button';

export function AIModalPromptField(props: {
  disabled: boolean;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleResizeStart: (event: MouseEvent) => void;
  isResizing: boolean;
  onSubmit: () => void;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  submitDisabled: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  voice: ReturnType<typeof useAIModalState>['voice'];
}) {
  const hintId = useId();
  const voiceErrorId = useId();
  const hasVoiceError = props.voice.state.errorCode !== null;

  useLayoutEffect(() => {
    const caretPosition = props.voice.state.caretPosition;
    const textarea = props.textareaRef.current;
    if (caretPosition === null || !textarea) return;
    textarea.setSelectionRange(caretPosition, caretPosition);
  }, [props.textareaRef, props.voice.state.caretPosition]);

  return (
    <ProductField label={translate('aiModal.promptLabel')}>
      <div className="sniptale-ai-modal-prompt-field">
        <ProductTextarea
          ref={props.textareaRef as Ref<HTMLTextAreaElement>}
          aria-describedby={[hintId, hasVoiceError ? voiceErrorId : null].filter(Boolean).join(' ')}
          className="sniptale-ai-modal-prompt-textarea"
          id="ai-prompt"
          value={props.prompt}
          onChange={(event) => {
            if (props.voice.state.active) props.voice.actions.stop();
            props.setPrompt(event.target.value);
          }}
          onKeyDown={props.handleKeyDown}
          disabled={props.disabled}
          placeholder={translate('aiModal.promptPlaceholder')}
          style={{ marginBottom: 0, resize: 'none' }}
        />
        <AIModalPromptVoiceButton
          disabled={props.disabled}
          onStart={() => {
            const textarea = props.textareaRef.current;
            props.voice.actions.start(
              props.prompt,
              textarea?.selectionStart ?? props.prompt.length
            );
          }}
          voice={props.voice}
        />
        <button
          aria-describedby={hintId}
          aria-label={translate('aiModal.submitShortcutTitle')}
          className="sniptale-ai-modal-prompt-submit"
          disabled={props.disabled || props.submitDisabled}
          onClick={props.onSubmit}
          title={translate('aiModal.submitShortcutTitle')}
          type="button"
        >
          <CornerDownLeft aria-hidden="true" size={15} strokeWidth={2} />
        </button>
        <div
          className={`sniptale-resizer ${props.isResizing ? 'active' : ''}`}
          onMouseDown={props.handleResizeStart}
        />
      </div>
      <span className="sr-only" id={hintId}>
        {translate('aiModal.submitShortcutDescription')}
      </span>
      {hasVoiceError ? (
        <p className="sniptale-ai-modal-prompt-voice-error" id={voiceErrorId} role="alert">
          {translate('aiModal.voiceInputError')}
        </p>
      ) : null}
    </ProductField>
  );
}

export function renderAIModalPromptField(args: {
  disabled: boolean;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  state: ReturnType<typeof useAIModalState>;
  submitDisabled: boolean;
}) {
  return (
    <AIModalPromptField
      disabled={args.disabled}
      handleKeyDown={args.handleKeyDown}
      handleResizeStart={args.state.handleResizeStart}
      isResizing={args.state.isResizing}
      onSubmit={args.onSubmit}
      prompt={args.state.prompt}
      setPrompt={args.state.setPrompt}
      submitDisabled={args.submitDisabled}
      textareaRef={args.state.textareaRef}
      voice={args.state.voice}
    />
  );
}
