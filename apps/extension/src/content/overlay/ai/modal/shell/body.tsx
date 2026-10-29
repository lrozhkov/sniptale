import { useEffect, useRef } from 'react';
import { isTrustedKeyboardEvent } from '../../../../platform/trusted-events';
import { isContentEventWithinElement } from '../../../../platform/dom-host';
import { AIModalDialog, AIModalTemplateEditor } from './dialog';
import {
  createAIModalKeyDownHandler,
  createAIModalSubmitHandler,
  getAIModalFooterProps,
} from './helpers';
import { AIModalSelectionFeedback } from './model-selector';
import { AIModalFooter } from './footer';
import { AIModalHeaderTitle } from './header';
import { renderAIModalPromptField } from './prompt-field';
import type { AIModalProps } from './types';
import type { useAIModalState } from '../session';

export function AIModalContent({
  isLoading,
  onCancelLoading,
  onClose,
  onSubmit,
  treeData,
  state,
}: AIModalProps & {
  state: ReturnType<typeof useAIModalState>;
}) {
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);
  const handleClose = () => {
    preparation.current?.abort();
    state.voice.actions.cancel();
    onClose();
  };
  const handleSubmit = createAIModalSubmitHandler(
    (prompt, selectedData) => {
      if (preparation.current) return;
      const controller = new AbortController();
      preparation.current = controller;
      state.voice.actions.cancel();
      void state.modelSelection
        .prepareModelSelection(controller.signal)
        .then(({ modelId }) => {
          controller.signal.throwIfAborted();
          onSubmit(prompt, selectedData, modelId);
        })
        .catch(() => {
          // The selection workflow owns catalog, preference and unavailable feedback.
        })
        .finally(() => {
          if (preparation.current === controller) preparation.current = null;
        });
    },
    isLoading || state.modelSelection.selectionPending,
    state.prompt,
    state.selectedData,
    state.selectedModelId
  );
  const footerProps = getAIModalFooterProps(handleSubmit, isLoading, handleClose, state);
  const handleKeyDown = createAIModalKeyDownHandler({
    canSubmit: !footerProps.disabledSubmit,
    handleSubmit,
  });

  useEffect(() => {
    const handleNativeShortcut = (event: KeyboardEvent) => {
      if (
        !isTrustedKeyboardEvent(event) ||
        !isContentEventWithinElement(event, state.textareaRef.current) ||
        event.isComposing ||
        event.key !== 'Enter' ||
        !(event.ctrlKey || event.metaKey) ||
        footerProps.disabledSubmit
      )
        return;
      // The editable bridge forwards an untrusted local event before this original event.
      event.preventDefault();
      event.stopImmediatePropagation();
      handleSubmit();
    };
    window.addEventListener('keydown', handleNativeShortcut, true);
    return () => window.removeEventListener('keydown', handleNativeShortcut, true);
  }, [footerProps.disabledSubmit, handleSubmit, state.textareaRef]);

  return (
    <>
      <AIModalDialog
        onClose={handleClose}
        onStopVoice={state.voice.actions.cancel}
        promptField={
          <>
            {renderAIModalPromptField({
              disabled: Boolean(isLoading),
              handleKeyDown,
              state,
            })}
            <AIModalSelectionFeedback selection={state.modelSelection} />
          </>
        }
        state={state}
        title={<AIModalHeaderTitle {...(treeData === undefined ? {} : { treeData })} />}
        voiceActive={state.voice.state.active || state.voice.state.pending}
        {...(isLoading === undefined ? {} : { isLoading })}
        {...(onCancelLoading === undefined ? {} : { onCancelLoading })}
        {...(treeData === undefined ? {} : { treeData })}
      >
        {isLoading ? null : <AIModalFooter {...footerProps} />}
      </AIModalDialog>
      <AIModalTemplateEditor
        onClose={() => state.setIsEditorOpen(false)}
        onSave={state.handleSaveTemplate}
        state={state}
        {...(isLoading === undefined ? {} : { isLoading })}
      />
    </>
  );
}
