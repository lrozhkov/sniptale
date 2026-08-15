import type {
  PopupExportPreferenceValues,
  PopupExportPreferenceSetters,
  PopupExportSelection,
} from '../../session/types';

export function toPopupExportSelection(
  preferences: PopupExportPreferenceValues | PopupExportSelection
): PopupExportSelection {
  return {
    includeAnnotations: preferences.includeAnnotations,
    includeBasicLogs: preferences.includeBasicLogs,
    includeCssDiagnostics: preferences.includeCssDiagnostics,
    includeFiles: preferences.includeFiles,
    includeFullPageScreenshot: preferences.includeFullPageScreenshot,
    includePageDiagnostics: preferences.includePageDiagnostics,
    includeImages: preferences.includeImages,
    includeJson: preferences.includeJson,
    includeMarkdown: preferences.includeMarkdown,
  };
}

export function applyPopupExportSelection(
  selection: PopupExportSelection,
  preferences: PopupExportPreferenceSetters
) {
  preferences.setIncludeAnnotations(selection.includeAnnotations);
  preferences.setIncludeBasicLogs(selection.includeBasicLogs);
  preferences.setIncludeCssDiagnostics(selection.includeCssDiagnostics);
  preferences.setIncludeFiles(selection.includeFiles);
  preferences.setIncludeFullPageScreenshot(selection.includeFullPageScreenshot);
  preferences.setIncludePageDiagnostics(selection.includePageDiagnostics);
  preferences.setIncludeImages(selection.includeImages);
  preferences.setIncludeJson(selection.includeJson);
  preferences.setIncludeMarkdown(selection.includeMarkdown);
}

export function arePopupExportSelectionsEqual(
  left: PopupExportSelection,
  right: PopupExportSelection
) {
  return (
    left.includeAnnotations === right.includeAnnotations &&
    left.includeBasicLogs === right.includeBasicLogs &&
    left.includeCssDiagnostics === right.includeCssDiagnostics &&
    left.includeFiles === right.includeFiles &&
    left.includeFullPageScreenshot === right.includeFullPageScreenshot &&
    left.includePageDiagnostics === right.includePageDiagnostics &&
    left.includeImages === right.includeImages &&
    left.includeJson === right.includeJson &&
    left.includeMarkdown === right.includeMarkdown
  );
}
