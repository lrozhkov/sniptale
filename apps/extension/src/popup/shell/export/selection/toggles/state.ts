import { useState } from 'react';

import type { PopupPagePackagePreferenceState } from '../../session/types';
import type { PopupPagePackageSelection } from '../../../../../composition/persistence/popup-export-preferences';

export function usePopupExportPreferenceState(
  initial: PopupPagePackageSelection
): PopupPagePackagePreferenceState {
  const [includeAnnotations, setIncludeAnnotations] = useState(initial.includeAnnotations);
  const [includeJson, setIncludeJson] = useState(initial.includeJson);
  const [includeMarkdown, setIncludeMarkdown] = useState(initial.includeMarkdown);
  const [includeFiles, setIncludeFiles] = useState(initial.includeFiles);
  const [includeImages, setIncludeImages] = useState(initial.includeImages);
  const [includeBasicLogs, setIncludeBasicLogs] = useState(initial.includeBasicLogs);
  const [includePageDiagnostics, setIncludePageDiagnostics] = useState(
    initial.includePageDiagnostics
  );
  const [includeCssDiagnostics, setIncludeCssDiagnostics] = useState(initial.includeCssDiagnostics);
  const [includeFullPageScreenshot, setIncludeFullPageScreenshot] = useState(
    initial.includeFullPageScreenshot
  );
  const [includeWebCopy, setIncludeWebCopy] = useState(initial.includeWebCopy);

  return {
    actions: {
      setIncludeAnnotations,
      setIncludeBasicLogs,
      setIncludeCssDiagnostics,
      setIncludeFiles,
      setIncludeFullPageScreenshot,
      setIncludePageDiagnostics,
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
      includePageDiagnostics,
      includeImages,
      includeJson,
      includeMarkdown,
    },
    includeWebCopy,
    setIncludeWebCopy,
  };
}
