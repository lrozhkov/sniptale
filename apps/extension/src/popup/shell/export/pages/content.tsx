import { ExportProgressSection } from '../progress';
import { ExportReadySection } from '../ready';
import type { PopupExportController } from '../controller';
import type { PopupPackageDestination } from '../data-type/package-controls';
import type { WebCopyResourcePreferences } from './snapshot-availability';

type ExportController = PopupExportController;

function shouldRenderProgressContent(controller: ExportController): boolean {
  const { derived, session } = controller.state;
  return (
    derived.isExporting ||
    Boolean(session.transfer.result) ||
    session.transfer.progress.phase === 'cancelled' ||
    session.transfer.progress.phase === 'error'
  );
}

function renderProgressContent(controller: ExportController) {
  const { derived, session } = controller.state;
  return (
    <ExportProgressSection
      isExporting={derived.isExporting}
      progressSteps={derived.progressSteps}
      onCancel={() => {
        void controller.actions.handleCancelExport();
      }}
      progress={session.transfer.progress}
      result={session.transfer.result}
    />
  );
}

function renderReadyContent(
  controller: ExportController,
  destination: PopupPackageDestination,
  onDestinationChange: (destination: PopupPackageDestination) => void,
  webCopyResources: WebCopyResourcePreferences
) {
  const { derived, preferences, tabs } = controller.state;
  return (
    <ExportReadySection
      activeSourceMode={tabs.activeSourceMode}
      availableTabs={tabs.availableTabs}
      destination={destination}
      disabled={Boolean(derived.exportDisabledReason) || !preferences.hasLoadedPreferences}
      filterQuery={tabs.filterQuery}
      filteredTabs={tabs.filteredTabs}
      hasLoadedPreferences={preferences.hasLoadedPreferences}
      includeAnnotations={preferences.values.includeAnnotations}
      includeBasicLogs={preferences.values.includeBasicLogs}
      includeCssDiagnostics={preferences.values.includeCssDiagnostics}
      includeFiles={preferences.values.includeFiles}
      includeFullPageScreenshot={preferences.values.includeFullPageScreenshot}
      includePageDiagnostics={preferences.values.includePageDiagnostics}
      includeImages={preferences.values.includeImages}
      includeJson={preferences.values.includeJson}
      includeMarkdown={preferences.values.includeMarkdown}
      includeWebCopy={preferences.includeWebCopy}
      isFilterActive={tabs.isFilterActive}
      selectedCount={tabs.selectedCount}
      selectedUrls={tabs.selectedUrls}
      setActiveSourceMode={tabs.setActiveSourceMode}
      setIncludeAnnotations={preferences.actions.setIncludeAnnotations}
      setIncludeBasicLogs={preferences.actions.setIncludeBasicLogs}
      setIncludeCssDiagnostics={preferences.actions.setIncludeCssDiagnostics}
      setFilterQuery={tabs.setFilterQuery}
      setIncludeFiles={preferences.actions.setIncludeFiles}
      setIncludeFullPageScreenshot={preferences.actions.setIncludeFullPageScreenshot}
      setIncludePageDiagnostics={preferences.actions.setIncludePageDiagnostics}
      setIncludeImages={preferences.actions.setIncludeImages}
      setIncludeJson={preferences.actions.setIncludeJson}
      setIncludeMarkdown={preferences.actions.setIncludeMarkdown}
      setIncludeWebCopy={preferences.setIncludeWebCopy}
      savePreferences={preferences.save}
      onDestinationChange={onDestinationChange}
      webCopyResources={webCopyResources}
      selectedTabIds={tabs.selectedTabIds}
      toggleSelectAllTabs={tabs.toggleSelectAllTabs}
      toggleTabSelection={tabs.toggleTabSelection}
      removeSelectedUrl={tabs.removeSelectedUrl}
      setUrlInput={tabs.setUrlInput}
      urlInput={tabs.urlInput}
      urlInputInvalid={tabs.urlInputInvalid}
      urlInputOverflow={tabs.urlInputOverflow}
    />
  );
}

export function ExportPageContent({
  controller,
  destination,
  onDestinationChange,
  webCopyResources,
}: {
  controller: ExportController;
  destination: PopupPackageDestination;
  onDestinationChange: (destination: PopupPackageDestination) => void;
  webCopyResources: WebCopyResourcePreferences;
}) {
  if (shouldRenderProgressContent(controller)) {
    return renderProgressContent(controller);
  }

  return renderReadyContent(controller, destination, onDestinationChange, webCopyResources);
}
