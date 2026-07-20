import { CommandPalette } from '../../../ui/command-palette';
import type { CommandPaletteAction } from '../../../ui/command-palette/types';
import type { UseGalleryAppActionsResult } from '../../library/actions/useGalleryAppActions.types';
import type { GalleryAppStateController } from '../app/types';
import { buildGalleryCommandPaletteActions } from './actions';

interface GalleryCommandPaletteProps {
  controller: GalleryAppStateController;
  actions: UseGalleryAppActionsResult;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function GalleryCommandPalette({
  controller,
  actions,
  isOpen,
  onClose,
  onRefresh,
}: GalleryCommandPaletteProps) {
  const paletteActions: CommandPaletteAction[] = buildGalleryCommandPaletteActions(
    controller,
    actions,
    onRefresh
  );

  return (
    <CommandPalette
      isOpen={isOpen}
      onClose={onClose}
      actions={paletteActions}
      storageKey="sniptale.gallery.command-palette"
      dataUi="gallery.command-palette"
    />
  );
}
