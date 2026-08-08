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
import type { useAIModalState } from '../session';
import { AIModalPromptActions } from './prompt-actions';

export function AIModalPromptField(props: {
  disabled: boolean;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  handleResizeStart: (event: MouseEvent) => void;
  isResizing: boolean;
  prompt: string;
  setPrompt: Dispatch<SetStateAction<string>>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  voice: ReturnType<typeof useAIModalState>['voice'];
  templates: ReturnType<typeof useAIModalState>['templates'];
  templatesLoading: boolean;
  onSelectTemplate: ReturnType<typeof useAIModalState>['handleSelectTemplate'];
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

  useLayoutEffect(() => {
    resizePromptTextarea(props.textareaRef.current);
  }, [props.prompt, props.textareaRef]);

  return (
    <ProductField>
      <div className="sniptale-ai-modal-prompt-field">
        <ProductTextarea
          ref={props.textareaRef as Ref<HTMLTextAreaElement>}
          aria-describedby={[hintId, hasVoiceError ? voiceErrorId : null].filter(Boolean).join(' ')}
          className="sniptale-ai-modal-prompt-textarea"
          id="ai-prompt"
          value={props.prompt}
          onChange={(event) => {
            if (props.voice.state.active) props.voice.actions.stop();
            resizePromptTextarea(event.currentTarget);
            props.setPrompt(event.target.value);
          }}
          onKeyDown={props.handleKeyDown}
          disabled={props.disabled}
          placeholder={translate('aiModal.promptPlaceholder')}
          style={{ marginBottom: 0, resize: 'none' }}
        />
        {props.disabled ? null : (
          <AIModalPromptActions
            onSelectTemplate={props.onSelectTemplate}
            prompt={props.prompt}
            templates={props.templates}
            templatesLoading={props.templatesLoading}
            textareaRef={props.textareaRef}
            voice={props.voice}
          />
        )}
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

function resizePromptTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) return;
  textarea.style.height = 'auto';
  const height = Math.min(Math.max(textarea.scrollHeight, 90), 136);
  textarea.style.height = `${height}px`;
  textarea.style.overflowY = textarea.scrollHeight > 136 ? 'auto' : 'hidden';
}

export function renderAIModalPromptField(args: {
  disabled: boolean;
  handleKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  state: ReturnType<typeof useAIModalState>;
}) {
  return (
    <AIModalPromptField
      disabled={args.disabled}
      handleKeyDown={args.handleKeyDown}
      handleResizeStart={args.state.handleResizeStart}
      isResizing={args.state.isResizing}
      onSelectTemplate={args.state.handleSelectTemplate}
      prompt={args.state.prompt}
      setPrompt={args.state.setPrompt}
      textareaRef={args.state.textareaRef}
      templates={args.state.templates}
      templatesLoading={args.state.templatesLoading}
      voice={args.state.voice}
    />
  );
}
