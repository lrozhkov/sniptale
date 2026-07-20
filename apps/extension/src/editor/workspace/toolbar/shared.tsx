import { translate } from '../../../platform/i18n';
import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import {
  EditorIconButton,
  EditorToolbarDivider,
  EditorToolbarSection,
  EditorToolbarShell,
} from '../../chrome/ui';

export { EditorToolbarDivider, EditorToolbarShell };

function SelectionAwareToolbarButton(props: {
  children: React.ReactNode;
  disabled: boolean;
  onAction: () => Promise<void>;
  onBeforeSelectionAwareAction: () => void;
  title: string;
  trackerLabel: string;
}) {
  const controller = useEditorController();

  return (
    <EditorIconButton
      title={props.title}
      onClick={() =>
        fireAndReportSelectionAwareEditorAction(
          props.trackerLabel,
          controller,
          props.onBeforeSelectionAwareAction,
          props.onAction
        )
      }
      disabled={props.disabled}
    >
      {props.children}
    </EditorIconButton>
  );
}

export function EditorToolbarUndoSection(props: {
  hasImage: boolean;
  history: { canUndo: boolean; canRedo: boolean };
  onBeforeSelectionAwareAction: () => void;
}) {
  const controller = useEditorController();

  return (
    <EditorToolbarSection className="min-w-0">
      <SelectionAwareToolbarButton
        title={getUndoButtonTitle(props.history.canUndo)}
        disabled={!props.history.canUndo}
        onAction={() => controller.undo()}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        trackerLabel="toolbar-undo"
      >
        <Undo2 size={18} strokeWidth={2} />
      </SelectionAwareToolbarButton>
      <SelectionAwareToolbarButton
        title={getRedoButtonTitle(props.history.canRedo)}
        disabled={!props.history.canRedo}
        onAction={() => controller.redo()}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        trackerLabel="toolbar-redo"
      >
        <Redo2 size={18} strokeWidth={2} />
      </SelectionAwareToolbarButton>
      <SelectionAwareToolbarButton
        title={translate('editor.toolbar.resetOriginal')}
        disabled={!props.hasImage}
        onAction={() => controller.resetToOriginal()}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        trackerLabel="toolbar-reset-to-original"
      >
        <RotateCcw size={18} strokeWidth={2} />
      </SelectionAwareToolbarButton>
    </EditorToolbarSection>
  );
}

function fireAndReportSelectionAwareEditorAction(
  label: string,
  controller: Pick<ReturnType<typeof useEditorController>, 'clearSelection'>,
  onBeforeSelectionAwareAction: () => void,
  action: () => Promise<void>
) {
  return fireAndReportEditorAction(label, async () => {
    onBeforeSelectionAwareAction();
    controller.clearSelection();
    await action();
  });
}

function getUndoButtonTitle(canUndo: boolean): string {
  return canUndo
    ? translate('editor.toolbar.undo')
    : `${translate('editor.toolbar.undo')} · ${translate('editor.toolbar.undoUnavailableReason')}`;
}

function getRedoButtonTitle(canRedo: boolean): string {
  return canRedo
    ? translate('editor.toolbar.redo')
    : `${translate('editor.toolbar.redo')} · ${translate('editor.toolbar.redoUnavailableReason')}`;
}
