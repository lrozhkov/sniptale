import { CommandPalette } from '../../../ui/command-palette';
import { type CommandPaletteAction } from '../../../ui/command-palette/types';
import type { VideoEditorCommandPaletteController } from '../../runtime/controller/contracts/surface';
import { buildVideoEditorCommandPaletteActions } from './actions';

interface VideoEditorCommandPaletteProps {
  controller: VideoEditorCommandPaletteController;
  isOpen: boolean;
  onClose: () => void;
}

export function VideoEditorCommandPalette({
  controller,
  isOpen,
  onClose,
}: VideoEditorCommandPaletteProps) {
  const actions: CommandPaletteAction[] = buildVideoEditorCommandPaletteActions(controller);

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={actions}
      storageKey="sniptale.video-editor.command-palette"
      dataUi="video-editor.command-palette"
    />
  );
}
