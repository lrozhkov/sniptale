import { Check, ClipboardCopy, Download, FileCheck2, FolderInput, Save, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromeDivider } from '@sniptale/ui/floating-chrome';
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
import { EditorSaveToFolderDialog } from './save-to-folder-dialog';
import { useEditorStore } from '../../state/useEditorStore';
import { closeEditorPageDocument } from '../../workflows/close-page-document';
import { EditorAnchoredConfirmPopover } from './anchored-feedback';

const QUICK_ACTION_BUTTON_CLASS_NAME = 'max-[720px]:!hidden';
const COPY_FEEDBACK_BUTTON_CLASS_NAME = [
  QUICK_ACTION_BUTTON_CLASS_NAME,
  'data-[copy-status=saved]:scale-105 data-[copy-status=saved]:text-[var(--sniptale-color-success)]',
].join(' ');
const RASTER_FILENAME_EXTENSION = /\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

function resolveDefaultExportFilename(pageTitle: string, imageFormat: string): string {
  const title = pageTitle.trim() || 'edited';
  const basename = title.replace(RASTER_FILENAME_EXTENSION, '');
  return `${basename}.${imageFormat}`;
}

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
  return { canCopy, copyStatus, imageFormat: exportSettings.imageFormat, runActionFeedback };
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
  const pageTitle = useEditorStore((state) => state.pageTitle);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const saveToFolderButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const standalone = embed.mode !== 'scenario';
  const defaultFilename = resolveDefaultExportFilename(pageTitle, actionState.imageFormat);

  return (
    <>
      <DocumentImageQuickActions
        actionState={actionState}
        documentController={documentController}
        hasImage={hasImage}
      />
      {standalone && documentController.savePresets.length > 0 ? (
        <ContentToolbarButton
          ref={saveToFolderButtonRef}
          title={translate('editor.documentActions.saveToFolder')}
          disabled={!hasImage}
          active={saveDialogOpen}
          aria-expanded={saveDialogOpen}
          aria-haspopup="dialog"
          className={QUICK_ACTION_BUTTON_CLASS_NAME}
          onClick={() => setSaveDialogOpen((open) => !open)}
          dataUi="editor.floating.document-bar.save-to-folder-button"
        >
          <FolderInput size={18} strokeWidth={2} />
        </ContentToolbarButton>
      ) : null}
      {standalone ? (
        <>
          <FloatingChromeDivider vertical className={QUICK_ACTION_BUTTON_CLASS_NAME} />
          <ContentToolbarButton
            ref={closeButtonRef}
            title={translate('editor.documentActions.closeFile')}
            disabled={!hasImage}
            active={closeConfirmOpen}
            aria-expanded={closeConfirmOpen}
            aria-haspopup="dialog"
            onClick={() => setCloseConfirmOpen((open) => !open)}
            dataUi="editor.floating.document-bar.close-file-button"
          >
            <X size={18} strokeWidth={2} />
          </ContentToolbarButton>
        </>
      ) : null}
      <ScenarioQuickActions
        controller={controller}
        embed={embed}
        hasImage={hasImage}
        onBeforeSelectionAwareAction={onBeforeSelectionAwareAction}
      />
      {saveDialogOpen ? (
        <EditorSaveToFolderDialog
          anchorEl={saveToFolderButtonRef.current}
          controller={documentController}
          defaultFilename={defaultFilename}
          onClose={() => setSaveDialogOpen(false)}
        />
      ) : null}
      {closeConfirmOpen ? (
        <EditorAnchoredConfirmPopover
          anchorEl={closeButtonRef.current}
          cancelText={translate('common.actions.cancel')}
          confirmText={translate('common.actions.close')}
          dataUi="editor.floating.document-bar.close-confirm"
          message={translate('editor.documentActions.confirmCloseDocument')}
          onCancel={() => setCloseConfirmOpen(false)}
          onConfirm={() =>
            runDocumentBarAction('close-file', async () => {
              await closeEditorPageDocument({
                controller,
                closeSavePicker: () => documentController.setSavePresetPickerOpen(false),
              });
              setCloseConfirmOpen(false);
            })
          }
          title={translate('editor.documentActions.closeFile')}
        />
      ) : null}
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
          title={translate('editor.documentActions.returnToScenario')}
          onClick={() => runDocumentBarAction('close-scenario-editor', () => embed.onClose?.())}
          dataUi="editor.floating.document-bar.close-scenario-button"
        >
          <X size={18} strokeWidth={2} />
        </ContentToolbarButton>
      ) : null}
    </>
  );
}
