import { useCallback, useState } from 'react';
import { usePageLocaleMetadata } from '../../../platform/i18n';
import { useCommandPaletteHotkey } from '../../../ui/command-palette/hotkey';
import { GalleryCommandPalette } from '../command-palette';
import { useGalleryAppActions } from '../../library/actions/useGalleryAppActions';
import type { GalleryViewMode } from '../app/types';
import { GalleryAppBindings } from './bindings';
import { useGalleryAppState } from '../../state';

export function GalleryApp() {
  usePageLocaleMetadata('gallery.app.documentTitle');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<GalleryViewMode>('compact-grid');
  const controller = useGalleryAppState(viewMode);
  const actions = useGalleryAppActions(controller);
  const handleRefreshAll = useCallback(() => {
    void controller.actions.storage.refresh();
  }, [controller]);

  useCommandPaletteHotkey({
    isOpen: commandPaletteOpen,
    onOpen: () => setCommandPaletteOpen(true),
    onClose: () => setCommandPaletteOpen(false),
  });

  return (
    <>
      <GalleryAppBindings
        controller={controller}
        actions={actions}
        onRefreshAll={handleRefreshAll}
        setViewMode={setViewMode}
        viewMode={viewMode}
      />
      <GalleryCommandPalette
        controller={controller}
        actions={actions}
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onRefresh={handleRefreshAll}
      />
    </>
  );
}
