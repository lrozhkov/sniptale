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
  const handleSubmit = createAIModalSubmitHandler(
    onSubmit,
    isLoading,
    state.prompt,
    state.selectedData,
    state.selectedModelId
  );
  const footerProps = getAIModalFooterProps(handleSubmit, isLoading, onClose, state);
  const handleKeyDown = createAIModalKeyDownHandler({
    canSubmit: !footerProps.disabledSubmit,
    handleSubmit,
    isLoading,
    onClose,
  });

  return (
    <>
      <AIModalDialog
        onClose={onClose}
        promptField={renderAIModalPromptField(handleKeyDown, isLoading, state)}
        state={state}
        title={<AIModalHeaderTitle {...(treeData === undefined ? {} : { treeData })} />}
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
