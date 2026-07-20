import { useState } from 'react';

export function useContentModeFlags() {
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [highlighterMode, setHighlighterMode] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [quickEditDocumentMode, setQuickEditDocumentMode] = useState(false);
  const [aiPickMode, setAiPickMode] = useState(false);

  return {
    aiPickMode,
    highlighterMode,
    quickEditDocumentMode,
    quickEditMode,
    screenshotMode,
    setAiPickMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
    setScreenshotMode,
  };
}
