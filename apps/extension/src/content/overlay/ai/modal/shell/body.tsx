import { AIModalDialog, AIModalTemplateEditor } from './dialog';
import {
  createAIModalKeyDownHandler,
  createAIModalSubmitHandler,
  getAIModalFooterProps,
} from './helpers';
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
  const handleClose = () => {
    state.voice.actions.stop();
    onClose();
  };
  const handleSubmit = createAIModalSubmitHandler(
    (...args) => {
      state.voice.actions.stop();
      onSubmit(...args);
    },
    isLoading,
    state.prompt,
    state.selectedData,
    state.selectedModelId
  );
  const footerProps = getAIModalFooterProps(handleSubmit, isLoading, handleClose, state);
  const handleKeyDown = createAIModalKeyDownHandler({
    canSubmit: !footerProps.disabledSubmit,
    handleSubmit,
  });

  return (
    <>
      <AIModalDialog
        onClose={handleClose}
        onStopVoice={state.voice.actions.stop}
        promptField={renderAIModalPromptField({
          disabled: Boolean(isLoading),
          handleKeyDown,
          onSubmit: handleSubmit,
          state,
          submitDisabled: footerProps.disabledSubmit,
        })}
        state={state}
        title={<AIModalHeaderTitle {...(treeData === undefined ? {} : { treeData })} />}
        voiceActive={state.voice.state.active}
        {...(isLoading === undefined ? {} : { isLoading })}
        {...(onCancelLoading === undefined ? {} : { onCancelLoading })}
        {...(treeData === undefined ? {} : { treeData })}
      >
        <AIModalFooter {...footerProps} />
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
