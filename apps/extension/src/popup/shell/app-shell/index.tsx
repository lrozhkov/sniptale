import type { PopupRuntimeState } from '../runtime/types/state';
import { CommandPaletteLayer } from './command-palette-layer';
import { PopupAppContent } from './content/view';
import { FooterLayer } from './footer-layer';
import { TabsLayer } from './tabs-layer';

export function PopupAppShell({
  runtime,
  commandPaletteOpen,
  onCloseCommandPalette,
}: {
  runtime: PopupRuntimeState;
  commandPaletteOpen: boolean;
  onCloseCommandPalette: () => void;
}) {
  return (
    <>
      <div className="relative flex h-full flex-col px-3 py-3">
        <TabsLayer runtime={runtime} />
        <div className="min-h-0 flex-1" data-ui="popup.app.content">
          <PopupAppContent runtime={runtime} />
        </div>
        {runtime.navigation.showFooter ? (
          <div className="mt-3">
            <FooterLayer />
          </div>
        ) : null}
      </div>
      <CommandPaletteLayer
        isOpen={commandPaletteOpen}
        onClose={onCloseCommandPalette}
        runtime={runtime}
      />
    </>
  );
}
