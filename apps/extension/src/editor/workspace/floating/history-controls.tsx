import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ContentToolbarButton } from '@sniptale/ui/content-toolbar';
import { FloatingChromeToolbar, floatingChromeClassNames } from '@sniptale/ui/floating-chrome';
import { translate } from '../../../platform/i18n';
import { useEditorController } from '../../application/controller-context';
import { fireAndReportEditorAction } from '../../runtime/async-actions';
import { getRedoButtonTitle, getUndoButtonTitle } from '../toolbar/history-titles';
import { EditorHistoryResetPopover, type EditorHistoryResetMode } from './history-reset-popover';

const TOOL_HISTORY_CONTROLS_CLASS_NAME = floatingChromeClassNames(
  'flex-row items-center gap-1.5 p-1.5',
  'absolute left-[calc(100%+0.75rem)] top-0'
);

export function EditorFloatingToolHistoryControls(props: {
  hasImage: boolean;
  autosaveControl: ReactNode;
  history: { canUndo: boolean; canRedo: boolean; index: number };
  onBeforeSelectionAwareAction: () => void;
}) {
  const controller = useEditorController();
  const [resetMode, setResetMode] = useState<EditorHistoryResetMode>('closed');
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const runSelectionAwareAction = (label: string, action: () => Promise<void> | void) =>
    fireAndReportEditorAction(label, async () => {
      props.onBeforeSelectionAwareAction();
      controller.clearSelection();
      await action();
    });

  return (
    <>
      <FloatingChromeToolbar
        dataUi="editor.floating.tool-rail.history"
        className={TOOL_HISTORY_CONTROLS_CLASS_NAME}
      >
        <ContentToolbarButton
          title={getUndoButtonTitle(props.history.canUndo)}
          disabled={!props.history.canUndo}
          onClick={() => runSelectionAwareAction('toolbar-undo', () => controller.undo())}
          dataUi="editor.floating.tool-rail.history.undo"
        >
          <Undo2 size={18} strokeWidth={2} />
        </ContentToolbarButton>
        <ContentToolbarButton
          title={getRedoButtonTitle(props.history.canRedo)}
          disabled={!props.history.canRedo}
          onClick={() => runSelectionAwareAction('toolbar-redo', () => controller.redo())}
          dataUi="editor.floating.tool-rail.history.redo"
        >
          <Redo2 size={18} strokeWidth={2} />
        </ContentToolbarButton>
        <ContentToolbarButton
          ref={resetButtonRef}
          title={translate('editor.toolbar.resetOriginalTooltip')}
          disabled={!props.hasImage}
          active={resetMode !== 'closed'}
          aria-expanded={resetMode !== 'closed'}
          aria-haspopup="dialog"
          onClick={() => setResetMode((mode) => (mode === 'closed' ? 'choose' : 'closed'))}
          dataUi="editor.floating.tool-rail.history.reset"
        >
          <RotateCcw size={18} strokeWidth={2} />
        </ContentToolbarButton>
        {props.autosaveControl}
      </FloatingChromeToolbar>
      <EditorHistoryResetPopover
        anchorEl={resetButtonRef.current}
        historyIndex={props.history.index}
        mode={resetMode}
        onBeforeSelectionAwareAction={props.onBeforeSelectionAwareAction}
        setMode={setResetMode}
      />
    </>
  );
}
