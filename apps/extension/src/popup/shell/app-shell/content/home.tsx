import type { PopupHomeRuntime } from '../../runtime/types/home-runtime';
import { PopupHomePage } from '../../home/page-shell';

export function PopupAppContentHome({ runtime }: { runtime: PopupHomeRuntime }) {
  return (
    <PopupHomePage
      quickActions={runtime.home.quickActions}
      quickActionsReady={runtime.home.quickActionsReady}
      displayMode={runtime.home.displayMode}
      viewportPresets={runtime.home.viewportPresets}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      galleryStatus={runtime.environment.galleryStatus}
      homeError={runtime.home.homeError}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
    />
  );
}
