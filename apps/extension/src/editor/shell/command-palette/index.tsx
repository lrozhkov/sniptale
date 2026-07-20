import { useCallback, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { CommandPalette } from '../../../ui/command-palette';
import { type CommandPaletteAction } from '../../../ui/command-palette/types';
import { useEditorController } from '../../application/controller-context';
import { reportEditorActionFailure } from '../../runtime/async-actions';
import { useEditorStore } from '../../state/useEditorStore';
import { buildEditorCommandPaletteActions } from './actions';

interface EditorCommandPaletteProps {
  hasImage: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export function EditorCommandPalette({ hasImage, isOpen, onClose }: EditorCommandPaletteProps) {
  const controller = useEditorController();
  const [actionError, setActionError] = useState<string | null>(null);
  const { activeTool, history, selection, setActiveTool, setInspector, setImageData } =
    useEditorStore(
      useShallow((state) => ({
        activeTool: state.activeTool,
        history: state.history,
        selection: state.selection,
        setActiveTool: state.setActiveTool,
        setInspector: state.setInspector,
        setImageData: state.setImageData,
      }))
    );

  const actions: CommandPaletteAction[] = buildEditorCommandPaletteActions({
    hasImage,
    controller,
    activeTool,
    history,
    selection,
    setActiveTool,
    setInspector,
    setImageData,
  });
  const handleActionError = useCallback((action: CommandPaletteAction, error: unknown) => {
    const message = reportEditorActionFailure(`command-palette:${action.id}`, error, {
      notify: false,
    });
    setActionError(message);
  }, []);

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={actions}
      actionError={actionError}
      onActionError={handleActionError}
      onActionStart={() => setActionError(null)}
      storageKey="sniptale.editor.command-palette"
      dataUi="editor.command-palette"
    />
  );
}
