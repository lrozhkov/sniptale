import { Suspense } from 'react';
import { LazyAIModal } from '../ai/modal/shell/lazy';
import { AutoBlurModal } from '../auto-blur/modal';
import { CountdownToast } from '../countdown-toast';
import { SaveDialogModal } from '../save-dialog-modal';
import { handleContentSaveDialogSave } from './save';
import type { ContentAppLayoutDialogsProps } from './types';

function ContentSaveDialog(props: ContentAppLayoutDialogsProps) {
  if (!props.saveDialogState) {
    return null;
  }

  const saveDialogState = props.saveDialogState;

  return (
    <SaveDialogModal
      dataUrl={saveDialogState.dataUrl}
      defaultFilename={saveDialogState.filename}
      onSave={(actionType, presetId, filename, contentIntentSource) =>
        handleContentSaveDialogSave({
          actionType,
          contentIntentSource,
          filename,
          presetId,
          saveDialogState,
        })
      }
      onClose={() => props.setSaveDialogState(null)}
      onSessionDontAsk={props.setSessionActivePresetId}
    />
  );
}

function ContentAIModal(props: ContentAppLayoutDialogsProps['aiController']) {
  if (!props.isAIModalOpen) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <LazyAIModal
        isOpen={props.isAIModalOpen}
        onClose={props.handleCloseAIModal}
        onSubmit={props.handleSubmitAIPrompt}
        isLoading={props.isAILoading}
        treeData={props.treeData}
        {...(props.handleCancelAIPrompt === undefined
          ? {}
          : { onCancelLoading: props.handleCancelAIPrompt })}
      />
    </Suspense>
  );
}

export function ContentDialogStack(props: { dialogs: ContentAppLayoutDialogsProps }) {
  const { dialogs } = props;

  return (
    <>
      <ContentAIModal {...dialogs.aiController} />

      <AutoBlurModal controller={dialogs.autoBlurController} />

      <ContentSaveDialog {...dialogs} />

      {dialogs.countdown !== null ? (
        <CountdownToast count={dialogs.countdown} onCancel={dialogs.handleCancelCountdown} />
      ) : null}
      {dialogs.countdown === null && dialogs.quickActionToastCountdown !== null ? (
        <CountdownToast count={dialogs.quickActionToastCountdown} />
      ) : null}
    </>
  );
}
