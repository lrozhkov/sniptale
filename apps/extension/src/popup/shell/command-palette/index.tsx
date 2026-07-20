import { CommandPalette } from '../../../ui/command-palette';
import { type CommandPaletteAction } from '../../../ui/command-palette/types';
import type { PopupCommandPaletteRuntime } from '../runtime/types/command-palette';
import { buildPopupCommandPaletteActions } from './actions';

interface PopupCommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  runtime: PopupCommandPaletteRuntime;
}

export default function PopupCommandPalette({
  isOpen,
  onClose,
  runtime,
}: PopupCommandPaletteProps) {
  const actions: CommandPaletteAction[] = buildPopupCommandPaletteActions(runtime);

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={actions}
      storageKey="sniptale.popup.command-palette"
      dataUi="popup.command-palette"
    />
  );
}
