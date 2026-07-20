import { useMemo, useState } from 'react';

import type { PopupExportPreferenceActions, PopupExportPreferenceState } from '../../session/types';

export function usePopupExportPreferenceState(): PopupExportPreferenceState {
  const [includeJson, setIncludeJson] = useState(true);
  const [includeMarkdown, setIncludeMarkdown] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeBasicLogs, setIncludeBasicLogs] = useState(false);
  const [includeHarDomLogs, setIncludeHarDomLogs] = useState(false);
  const [includeCssDiagnostics, setIncludeCssDiagnostics] = useState(false);
  const [includeFullPageScreenshot, setIncludeFullPageScreenshot] = useState(false);

  return {
    actions: {
      setIncludeBasicLogs,
      setIncludeCssDiagnostics,
      setIncludeFiles,
      setIncludeFullPageScreenshot,
      setIncludeHarDomLogs,
      setIncludeImages,
      setIncludeJson,
      setIncludeMarkdown,
    },
    values: {
      includeBasicLogs,
      includeCssDiagnostics,
      includeFiles,
      includeFullPageScreenshot,
      includeHarDomLogs,
      includeImages,
      includeJson,
      includeMarkdown,
    },
  };
}

export function usePopupExportPreferenceSetters(
  preferences: PopupExportPreferenceState
): PopupExportPreferenceActions {
  const {
    setIncludeBasicLogs,
    setIncludeCssDiagnostics,
    setIncludeFiles,
    setIncludeFullPageScreenshot,
    setIncludeHarDomLogs,
    setIncludeImages,
    setIncludeJson,
    setIncludeMarkdown,
  } = preferences.actions;

  return useMemo(
    () => ({
      setIncludeBasicLogs,
      setIncludeCssDiagnostics,
      setIncludeFiles,
      setIncludeFullPageScreenshot,
      setIncludeHarDomLogs,
      setIncludeImages,
      setIncludeJson,
      setIncludeMarkdown,
    }),
    [
      setIncludeBasicLogs,
      setIncludeCssDiagnostics,
      setIncludeFiles,
      setIncludeFullPageScreenshot,
      setIncludeHarDomLogs,
      setIncludeImages,
      setIncludeJson,
      setIncludeMarkdown,
    ]
  );
}
