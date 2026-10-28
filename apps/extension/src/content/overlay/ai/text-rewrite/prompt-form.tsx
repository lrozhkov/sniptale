import { getAIProviderFailureKey } from '../../../../features/ai/provider-failure-copy';
import { useEffect, useId, useLayoutEffect, useRef, type SyntheticEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { ProductActionButton } from '@sniptale/ui/product-modal/actions';
import { CONTENT_AI_PAYLOAD_LIMITS } from '@sniptale/runtime-contracts/ai/payload-policy';
import { usePromptTemplates } from '../../../../features/prompt-templates/hooks/use-prompt-templates';
import { AIModalPromptTemplatePicker } from '../modal/shell/prompt-template-picker';
import { AIModelSelector } from '../../../../features/ai/model-selector';
import { translate } from '../../../../platform/i18n';
import { isContentEventWithinElement } from '../../../platform/dom-host';
import { ContentVoiceInputButton } from '../../../voice-input/button';
import { useAIModalPromptVoiceInput } from '../modal/session/prompt-voice-input';
import { isTrustedDomEvent, isTrustedKeyboardEvent } from '../../../platform/trusted-events';
import { isBridgedMouseEvent } from '../../../platform/trusted-events/synthetic-mouse';
import type { useTextRewriteSession } from './session';

type Session = ReturnType<typeof useTextRewriteSession>;
function TextRequestFeedback({ session }: { session: Session }) {
  const error = session.request.error;
  const providerReason = session.request.providerFailureReason;
  const providerKey = getAIProviderFailureKey(providerReason);
  const errorKeys = {
    stale: 'content.toolbar.aiTextStale',
    failed: 'content.toolbar.aiTextError',
    'model-unavailable': 'content.toolbar.aiTextModelUnavailable',
    'too-large': 'content.toolbar.aiTextTooLarge',
    timeout: 'content.toolbar.aiTextTimeout',
    cancelled: 'content.toolbar.aiTextCancelled',
  } as const;
  return (
    <>
      {session.request.busy ? (
        <p
          role="status"
          data-ui="content.ai-text.status"
          className="mt-2 flex gap-2 text-xs text-[var(--sniptale-color-text-secondary)]"
        >
          {translate('content.toolbar.aiTextWaiting')}
          <span role="timer" aria-live="off">
            {translate('content.toolbar.aiTextElapsed').replace(
              '{seconds}',
              String(session.request.elapsed)
            )}
          </span>
        </p>
      ) : null}
      {error ? (
        <p
          role={error === 'cancelled' ? 'status' : 'alert'}
          data-ui="content.ai-text.feedback"
          className={[
            'mt-2 text-xs leading-5',
            error === 'cancelled'
              ? 'text-[var(--sniptale-color-text-secondary)]'
              : 'text-[var(--sniptale-color-danger)]',
          ].join(' ')}
        >
          {error === 'model-unavailable' && session.models.unavailableModelName ? (
            <>
              <bdi className="[overflow-wrap:anywhere]">
                {session.models.unavailableModelName}
              </bdi>{' '}
            </>
          ) : null}
          {translate(providerKey ?? errorKeys[error])}
        </p>
      ) : null}
      {session.models.pending && !session.request.busy ? (
        <p role="status" className="sr-only">
          {translate('common.states.saving')}
        </p>
      ) : null}
      {session.models.unavailable && error !== 'model-unavailable' ? (
        <p role="status" className="mt-2 text-xs">
          <bdi className="[overflow-wrap:anywhere]">{session.models.unavailableModelName}</bdi>{' '}
          {translate('aiModal.modelSelectionUnavailable')}
        </p>
      ) : null}
      {session.models.selectionFailed ? (
        <p role="alert" className="mt-2 text-xs text-[var(--sniptale-color-danger)]">
          {translate('aiModal.modelSelectionSaveFailed')}
        </p>
      ) : null}
      {session.models.failed ? (
        <div className="mt-2 flex items-center gap-2">
          <p role="alert" className="text-xs text-[var(--sniptale-color-danger)]">
            {translate('content.toolbar.aiTextModelsError')}
          </p>
          <ProductActionButton
            compact
            onClick={session.models.reload}
            disabled={session.request.busy || session.models.pending}
          >
            {translate('common.actions.retry')}
          </ProductActionButton>
        </div>
      ) : null}
    </>
  );
}

function getTextDisclosure(models: Session['models']): string {
  const model = models.models.find((entry) => entry.id === models.selectedModelId);
  const provider = models.providers.find((entry) => entry.id === model?.providerId);
  const destination =
    provider?.connectionType === 'chrome-built-in'
      ? translate('aiModal.disclosureLocalDestination')
      : (provider?.name ?? translate('aiModal.disclosureExternalDestination'));
  const summary = translate('aiModal.disclosureSummary')
    .replace('{data}', translate('content.toolbar.aiTextDisclosureData'))
    .replace('{destination}', destination)
    .replace('{model}', model?.displayName ?? translate('aiModal.modelNotSelected'));
  return `${summary} ${translate('aiModal.disclosureHistory')}`;
}

function useTextRewritePrompt(session: Session) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voice = useAIModalPromptVoiceInput({
    enabled: !session.request.busy,
    setPrompt: session.setPrompt,
  });
  const voiceBusy = voice.state.active || voice.state.pending;
  const cancelVoice = voice.actions.cancel;
  useLayoutEffect(() => {
    cancelVoice();
  }, [session.target, cancelVoice]);
  useLayoutEffect(() => {
    const caret = voice.state.caretPosition;
    const input = textareaRef.current;
    if (caret === null || !input || input.disabled) return;
    input.focus();
    input.setSelectionRange(caret, caret);
  }, [voice.state.caretPosition]);
  const { submit: submitRequest, busy: requestBusy } = session.request;
  useEffect(() => {
    const handleSubmitKey = (event: KeyboardEvent) => {
      if (
        !isTrustedKeyboardEvent(event) ||
        !isContentEventWithinElement(event, textareaRef.current) ||
        event.isComposing ||
        event.key !== 'Enter' ||
        !(event.ctrlKey || event.metaKey) ||
        voiceBusy ||
        requestBusy ||
        session.models.pending
      )
        return;
      // The editable bridge dispatches an untrusted local key event before this original event.
      event.preventDefault();
      event.stopImmediatePropagation();
      void submitRequest(event);
    };
    window.addEventListener('keydown', handleSubmitKey, true);
    return () => window.removeEventListener('keydown', handleSubmitKey, true);
  }, [submitRequest, requestBusy, voiceBusy, session.models.pending]);
  return { textareaRef, voice, voiceBusy };
}

function TextRewritePromptFields({
  session,
  prompt,
}: {
  session: Session;
  prompt: ReturnType<typeof useTextRewritePrompt>;
}) {
  const templates = usePromptTemplates();
  const inputId = useId();
  const { textareaRef, voice, voiceBusy } = prompt;
  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        {translate('content.toolbar.aiTextPrompt')}
      </label>
      <div className="mb-2">
        <AIModalPromptTemplatePicker
          placement="inline"
          templates={templates.templates}
          isLoading={templates.isLoading}
          disabled={session.request.busy}
          onSelectTemplate={async (template) => {
            voice.actions.cancel();
            session.setPrompt(template.content);
            textareaRef.current?.focus();
          }}
        />
        {templates.error ? (
          <p role="alert" className="mt-1 text-xs text-[var(--sniptale-color-danger)]">
            {templates.error}
          </p>
        ) : null}
      </div>
      <div className="relative" data-ui="content.ai-text.prompt-field">
        <textarea
          ref={textareaRef}
          id={inputId}
          data-ui="content.ai-text.prompt"
          autoFocus
          rows={3}
          value={session.prompt}
          disabled={session.request.busy}
          maxLength={CONTENT_AI_PAYLOAD_LIMITS.maxPromptChars}
          placeholder={translate('content.toolbar.aiTextPlaceholder')}
          className={[
            'sniptale-design-review-authored-text block min-h-20 max-h-40 w-full resize-none overflow-y-auto',
            'rounded-[4px] border border-[color:var(--sniptale-color-border-strong)]',
            'bg-[var(--sniptale-color-surface-input)] py-2 pl-3 pr-12 text-xs leading-5',
            'text-[var(--sniptale-color-text-primary)] outline-none',
            'placeholder:text-[var(--sniptale-color-text-secondary)]',
            'focus:ring-1 focus:ring-[color:var(--sniptale-color-border-strong)] disabled:opacity-50',
          ].join(' ')}
          onChange={(event) => {
            if (voiceBusy) voice.actions.cancel();
            session.setPrompt(event.currentTarget.value);
          }}
        />
        <ContentVoiceInputButton
          className="!absolute bottom-2 right-2"
          dataUi="content.ai-text.voice"
          disabled={session.request.busy}
          labels={{
            error: translate('aiModal.voiceInputError'),
            start: translate('aiModal.voiceInputStart'),
            stop: translate('aiModal.voiceInputStop'),
          }}
          onStart={() =>
            voice.actions.start(
              session.prompt,
              textareaRef.current?.selectionStart ?? session.prompt.length
            )
          }
          onStop={voice.actions.stop}
          onCancel={voice.actions.cancel}
          state={voice.state}
        />
      </div>
    </>
  );
}

function requireTrustedModelInteraction(event: SyntheticEvent) {
  if (isTrustedDomEvent(event.nativeEvent) || isBridgedMouseEvent(event.nativeEvent)) return;
  event.preventDefault();
  event.stopPropagation();
}

function TextRewriteFooter({ session, voiceBusy }: { session: Session; voiceBusy: boolean }) {
  return (
    <div
      className="flex min-w-0 shrink-0 items-center gap-2 px-3 pb-3"
      data-ui="content.ai-text.footer"
    >
      <div
        className="min-w-0 flex-1"
        onMouseDownCapture={requireTrustedModelInteraction}
        onClickCapture={requireTrustedModelInteraction}
      >
        <AIModelSelector
          models={session.models.models}
          providers={session.models.providers}
          selectedModelId={session.models.selectedModelId}
          onSelect={session.models.select}
          onOpen={session.models.reload}
          isEventWithinElement={isContentEventWithinElement}
          disabled={session.request.busy || session.models.pending}
        />
      </div>
      <ProductActionButton
        compact
        tone="primary"
        type="button"
        data-ui="content.ai-text.submit"
        disabled={
          !session.request.busy &&
          (!session.prompt.trim() ||
            !session.models.selectedModelId ||
            voiceBusy ||
            session.models.pending)
        }
        title={session.request.busy ? undefined : getTextDisclosure(session.models)}
        aria-description={session.request.busy ? undefined : getTextDisclosure(session.models)}
        aria-keyshortcuts="Control+Enter Meta+Enter"
        onClick={(event) => {
          if (session.request.busy) session.request.cancel();
          else void session.request.submit(event.nativeEvent);
        }}
      >
        {session.request.busy ? (
          <Square size={14} aria-hidden="true" />
        ) : (
          <Send size={14} aria-hidden="true" />
        )}
        {translate(
          session.request.busy ? 'content.toolbar.aiTextStop' : 'content.toolbar.aiTextSend'
        )}
      </ProductActionButton>
    </div>
  );
}

export function TextRewriteForm({ session }: { session: Session }) {
  const prompt = useTextRewritePrompt(session);
  return (
    <div className="flex min-h-0 flex-col">
      <div className="min-h-0 overflow-y-auto px-3 pb-2">
        <TextRewritePromptFields session={session} prompt={prompt} />
        <TextRequestFeedback session={session} />
      </div>
      <TextRewriteFooter session={session} voiceBusy={prompt.voiceBusy} />
    </div>
  );
}
