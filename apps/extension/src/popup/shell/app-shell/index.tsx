import type { PopupCommandPaletteRuntime } from '../runtime/types/command-palette';
import type { PopupExportRuntime } from '../runtime/types/export-runtime';
import type { PopupHomeRuntime } from '../runtime/types/home-runtime';
import type { PopupVideoSetupRuntime } from '../runtime/types/video-setup';
import { CommandPaletteLayer } from './command-palette-layer';
import { PopupAppContent } from './content/view';
import { FooterLayer } from './footer-layer';
import { TabsLayer } from './tabs-layer';

type PopupAppShellRuntime = PopupHomeRuntime &
  PopupExportRuntime &
  PopupVideoSetupRuntime &
  PopupCommandPaletteRuntime;

export function PopupAppShell({
  runtime,
  commandPaletteOpen,
  onCloseCommandPalette,
}: {
  runtime: PopupAppShellRuntime;
  commandPaletteOpen: boolean;
  onCloseCommandPalette: () => void;
}) {
  return (
    <>
      <div className="relative flex h-full flex-col px-3 py-3">
        <TabsLayer runtime={runtime} />
        <div className="min-h-0 flex-1">
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
