import { ExportProgressSection } from '../progress';
import { ExportReadySection } from '../ready';
import type { PopupExportController } from '../controller';

type ExportController = PopupExportController;

function shouldRenderProgressContent(controller: ExportController): boolean {
  const { derived, session } = controller.state;
  return (
    derived.isExporting ||
    Boolean(session.transfer.result) ||
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

function renderReadyContent(controller: ExportController) {
  const { derived, preferences, tabs } = controller.state;
  return (
    <ExportReadySection
      availableTabs={tabs.availableTabs}
      disabled={Boolean(derived.exportDisabledReason) || !preferences.hasLoadedPreferences}
      filterQuery={tabs.filterQuery}
      filteredTabs={tabs.filteredTabs}
      hasLoadedPreferences={preferences.hasLoadedPreferences}
      includeBasicLogs={preferences.values.includeBasicLogs}
      includeCssDiagnostics={preferences.values.includeCssDiagnostics}
      includeFiles={preferences.values.includeFiles}
      includeFullPageScreenshot={preferences.values.includeFullPageScreenshot}
      includeHarDomLogs={preferences.values.includeHarDomLogs}
      includeImages={preferences.values.includeImages}
      includeJson={preferences.values.includeJson}
      includeMarkdown={preferences.values.includeMarkdown}
      isFilterActive={tabs.isFilterActive}
      selectedCount={tabs.selectedCount}
      setIncludeBasicLogs={preferences.actions.setIncludeBasicLogs}
      setIncludeCssDiagnostics={preferences.actions.setIncludeCssDiagnostics}
      setFilterQuery={tabs.setFilterQuery}
      setIncludeFiles={preferences.actions.setIncludeFiles}
      setIncludeFullPageScreenshot={preferences.actions.setIncludeFullPageScreenshot}
      setIncludeHarDomLogs={preferences.actions.setIncludeHarDomLogs}
      setIncludeImages={preferences.actions.setIncludeImages}
      setIncludeJson={preferences.actions.setIncludeJson}
      setIncludeMarkdown={preferences.actions.setIncludeMarkdown}
      selectedTabIds={tabs.selectedTabIds}
      toggleSelectAllTabs={tabs.toggleSelectAllTabs}
      toggleTabSelection={tabs.toggleTabSelection}
    />
  );
}

export function ExportPageContent({ controller }: { controller: ExportController }) {
  if (shouldRenderProgressContent(controller)) {
    return renderProgressContent(controller);
  }

  return renderReadyContent(controller);
}
