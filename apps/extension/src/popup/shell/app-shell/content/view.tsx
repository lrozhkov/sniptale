import type { PopupRuntimeState } from '../../runtime/types/state';
import { getResolvedExportPage } from '../../lazy-chunks';
import { PopupHomePage } from '../../home/page-shell';
import { PopupRouteLoadingFallback } from '../route-loading-fallback';
import { PopupVideoSetup } from '../video-setup';

export function PopupAppContent({ runtime }: { runtime: PopupRuntimeState }) {
  if (runtime.navigation.page === 'video') {
    return <PopupVideoSetup runtime={runtime} />;
  }

  if (runtime.navigation.page === 'export') {
    const ExportPage = getResolvedExportPage();
    if (!ExportPage) return <PopupRouteLoadingFallback />;
    return (
      <ExportPage
        isActive
        activeTabCapabilities={runtime.environment.activeTabCapabilities}
        {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
      />
    );
  }

  return (
    <PopupHomePage
      quickActions={runtime.home.quickActions}
      quickActionsReady={runtime.home.quickActionsReady}
      viewportPresets={runtime.home.viewportPresets}
      activeTabCapabilities={runtime.environment.activeTabCapabilities}
      homeError={runtime.home.homeError}
      startupMode={runtime.home.screenshotStartupMode}
      initialSetupState={runtime.home.initialScreenshotSetupState}
      onStartupModeCleared={runtime.home.clearScreenshotStartupMode}
      {...(runtime.environment.pageAccess ? { pageAccess: runtime.environment.pageAccess } : {})}
    />
  );
}
