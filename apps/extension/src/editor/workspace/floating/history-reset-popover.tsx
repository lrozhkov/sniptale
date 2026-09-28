import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { useEditorStore } from '../../state/useEditorStore';
import { runAndReportEditorAction } from '../../runtime/async-actions';
import { restoreOriginalEditorImage } from '../../workflows/restore-original-image';
import { EditorAnchoredConfirmPopover, EditorAnchoredHistoryChoices } from './anchored-feedback';

export type EditorHistoryResetMode = 'closed' | 'choose' | 'confirm';

export function EditorHistoryResetPopover(props: {
  anchorEl: HTMLElement | null;
  historyIndex: number;
  mode: EditorHistoryResetMode;
  onBeforeSelectionAwareAction: () => void;
  setMode: (mode: EditorHistoryResetMode) => void;
}) {
  const controller = useEditorController();
  const sessionId = useEditorStore((state) => state.sessionId);

  const runHistoryAction = async (label: string, action: () => Promise<void>) => {
    try {
      await runAndReportEditorAction(label, async () => {
        props.onBeforeSelectionAwareAction();
        controller.clearSelection();
        await action();
      });
      props.setMode('closed');
    } catch {
      // The action reporter shows the failure; leave the choice available for retry.
    }
  };

  if (props.mode === 'choose') {
    return (
      <EditorAnchoredHistoryChoices
        anchorEl={props.anchorEl}
        canReturnToStart={props.historyIndex > 0}
        dataUi="editor.floating.tool-rail.history.reset-choices"
        onClose={() => props.setMode('closed')}
        onReturnToStart={() =>
          void runHistoryAction('toolbar-return-to-history-start', () =>
            controller.resetToOriginal()
          )
        }
        onRestoreOriginal={() => props.setMode('confirm')}
        title={translate('editor.toolbar.historyChoicesTitle')}
        returnLabel={translate('editor.toolbar.historyStart')}
        returnDescription={translate('editor.toolbar.historyStartDescription')}
        restoreLabel={translate('editor.toolbar.restoreOriginal')}
        restoreDescription={translate('editor.toolbar.restoreOriginalDescription')}
      />
    );
  }

  if (props.mode === 'confirm') {
    return (
      <EditorAnchoredConfirmPopover
        anchorEl={props.anchorEl}
        title={translate('editor.toolbar.restoreOriginalTitle')}
        message={translate('editor.toolbar.restoreOriginalMessage')}
        confirmText={translate('editor.toolbar.restoreOriginal')}
        cancelText={translate('common.actions.cancel')}
        dataUi="editor.floating.tool-rail.history.reset-confirm"
        onCancel={() => props.setMode('choose')}
        onConfirm={() =>
          runHistoryAction('toolbar-restore-original', () =>
            restoreOriginalEditorImage(controller, sessionId)
          )
        }
      />
    );
  }

  return null;
}
