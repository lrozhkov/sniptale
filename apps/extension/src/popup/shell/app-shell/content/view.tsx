import type { PopupCommandPaletteRuntime } from '../../runtime/types/command-palette';
import type { PopupExportRuntime } from '../../runtime/types/export-runtime';
import type { PopupHomeRuntime } from '../../runtime/types/home-runtime';
import type { PopupVideoSetupRuntime } from '../../runtime/types/video-setup';
import { PopupAppContentExport } from './export';
import { PopupAppContentHome } from './home';
import { PopupAppContentVideoSetup } from './video-setup';

type PopupAppHomeRuntime = PopupHomeRuntime & PopupCommandPaletteRuntime;

type PopupAppExportRuntime = PopupExportRuntime;

type PopupAppVideoRuntime = PopupVideoSetupRuntime;

type PopupAppContentRuntime = PopupAppHomeRuntime & PopupAppExportRuntime & PopupAppVideoRuntime;

export function PopupAppContent({ runtime }: { runtime: PopupAppContentRuntime }) {
  if (runtime.navigation.page === 'video') {
    return <PopupAppContentVideoSetup runtime={runtime} />;
  }

  if (runtime.navigation.page === 'export') {
    return <PopupAppContentExport runtime={runtime} />;
  }

  return <PopupAppContentHome runtime={runtime} />;
}
