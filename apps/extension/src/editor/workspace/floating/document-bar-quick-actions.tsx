import { Check, ClipboardCopy, Download, FileCheck2, Save, X } from 'lucide-react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { useEditorEmbedContext } from '../../application/embed-context/context';
import { fireAndReportEditorAction, runAndReportEditorAction } from '../../runtime/async-actions';
import { useEditorExportSettingsState } from '../../inspector/document-actions/export-settings';
import { useDocumentActionFeedback } from '../../inspector/document-actions/feedback';
import { getDocumentRequiredTitle } from '../toolbar/section-helpers';
import type {
  EditorFloatingDocumentBarProps,
  EditorFloatingDocumentController,
} from './document-bar-types';

const QUICK_ACTION_BUTTON_CLASS_NAME = 'max-[720px]:!hidden';
const COPY_FEEDBACK_BUTTON_CLASS_NAME = [
  QUICK_ACTION_BUTTON_CLASS_NAME,
  'data-[copy-status=saved]:scale-105 data-[copy-status=saved]:text-[var(--sniptale-color-success)]',
].join(' ');

function runDocumentBarAction(label: string, action: () => Promise<void> | void) {
  return fireAndReportEditorAction(`floating-document-bar:${label}`, action);
}

function runFeedbackDocumentBarAction(label: string, action: () => Promise<void> | void) {
  return runAndReportEditorAction(`floating-document-bar:${label}`, action);
}

function useQuickActionState(
  documentController: EditorFloatingDocumentController,
  hasImage: boolean
) {
  const { getActionStatus, runActionFeedback } = useDocumentActionFeedback();
  const exportSettings = useEditorExportSettingsState();
  const copyStatus = getActionStatus('copy-png');
  const canCopy =
    hasImage &&
    !documentController.copyRenderedImageDisabledReason &&
    exportSettings.isClipboardCopySupported;
  return { canCopy, copyStatus, runActionFeedback };
}

export function EditorFloatingDocumentQuickActions({
  documentController,
  hasImage,
  onBeforeSelectionAwareAction,
}: Pick<
  EditorFloatingDocumentBarProps,
  'documentController' | 'hasImage' | 'onBeforeSelectionAwareAction'
>) {
  const controller = useEditorController();
  const embed = useEditorEmbedContext();
  const actionState = useQuickActionState(documentController, hasImage);

  return (
    <>
      <DocumentImageQuickActions
        actionState={actionState}
        documentController={documentController}
        hasImage={hasImage}
      />
      <ScenarioQuickActions
        controller={controller}
        embed={embed}
        hasImage={hasImage}
        onBeforeSelectionAwareAction={onBeforeSelectionAwareAction}
      />
    </>
  );
}

function DocumentImageQuickActions(props: {
  actionState: ReturnType<typeof useQuickActionState>;
  documentController: EditorFloatingDocumentController;
  hasImage: boolean;
}) {
  const { actionState, documentController, hasImage } = props;
  return (
    <>
      <ContentToolbarButton
        title={getDocumentRequiredTitle(translate('editor.documentActions.download'), hasImage)}
        disabled={!hasImage}
        className={QUICK_ACTION_BUTTON_CLASS_NAME}
        onClick={() => runDocumentBarAction('save-image', () => documentController.onSaveImage())}
        dataUi="editor.floating.document-bar.save-button"
      >
        <Download size={18} strokeWidth={2} />
      </ContentToolbarButton>
      <ContentToolbarButton
        title={getDocumentRequiredTitle(translate('editor.documentActions.downloadAs'), hasImage)}
        disabled={!hasImage}
        className={QUICK_ACTION_BUTTON_CLASS_NAME}
        onClick={() =>
          runDocumentBarAction('save-image-as', () => documentController.onSaveImageAs())
        }
        dataUi="editor.floating.document-bar.save-as-button"
      >
        <Save size={18} strokeWidth={2} />
      </ContentToolbarButton>
      {actionState.canCopy ? (
        <CopyPngQuickAction actionState={actionState} documentController={documentController} />
      ) : null}
    </>
  );
}

function CopyPngQuickAction(props: {
  actionState: ReturnType<typeof useQuickActionState>;
  documentController: EditorFloatingDocumentController;
}) {
  const { copyStatus, runActionFeedback } = props.actionState;
  return (
    <ContentToolbarButton
      title={translate('editor.documentActions.copyPng')}
      active={copyStatus === 'saved'}
      className={COPY_FEEDBACK_BUTTON_CLASS_NAME}
      data-copy-status={copyStatus}
      onClick={() =>
        void runActionFeedback('copy-png', () =>
          runFeedbackDocumentBarAction('copy-png', () =>
            props.documentController.onCopyRenderedImage()
          )
        ).catch(() => undefined)
      }
      dataUi="editor.floating.document-bar.copy-button"
    >
      {copyStatus === 'saved' ? (
        <Check size={18} strokeWidth={2.2} />
      ) : (
        <ClipboardCopy size={18} strokeWidth={2} />
      )}
    </ContentToolbarButton>
  );
}

function ScenarioQuickActions(props: {
  controller: ReturnType<typeof useEditorController>;
  embed: ReturnType<typeof useEditorEmbedContext>;
  hasImage: boolean;
  onBeforeSelectionAwareAction: () => void;
}) {
  const { controller, embed, hasImage, onBeforeSelectionAwareAction } = props;
  return (
    <>
      {embed.mode === 'scenario' && hasImage && embed.onApply ? (
        <ContentToolbarButton
          title={translate('editor.documentActions.applyToScenario')}
          onClick={() =>
            runDocumentBarAction('save-for-slide', async () => {
              onBeforeSelectionAwareAction();
              controller.clearSelection();
              await embed.onApply?.();
            })
          }
          dataUi="editor.floating.document-bar.save-for-slide-button"
        >
          <FileCheck2 size={18} strokeWidth={2} />
        </ContentToolbarButton>
      ) : null}
      {embed.mode === 'scenario' && embed.onClose ? (
        <ContentToolbarButton
          title={translate('common.actions.close')}
          onClick={() => runDocumentBarAction('close-scenario-editor', () => embed.onClose?.())}
          dataUi="editor.floating.document-bar.close-scenario-button"
        >
          <X size={18} strokeWidth={2} />
        </ContentToolbarButton>
      ) : null}
    </>
  );
}
