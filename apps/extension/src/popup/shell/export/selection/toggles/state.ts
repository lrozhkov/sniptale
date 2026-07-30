import { useMemo, useState } from 'react';

import type { PopupExportPreferenceActions, PopupExportPreferenceState } from '../../session/types';

export function usePopupExportPreferenceState(): PopupExportPreferenceState {
  const [includeAnnotations, setIncludeAnnotations] = useState(false);
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
      setIncludeAnnotations,
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
      includeAnnotations,
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
    setIncludeAnnotations,
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
      setIncludeAnnotations,
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
      setIncludeAnnotations,
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
