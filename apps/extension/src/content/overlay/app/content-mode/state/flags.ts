import { useState } from 'react';
import type { ContentAppModeControls, ContentAppModeFlags } from './types';

export function useContentModeFlags() {
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [highlighterMode, setHighlighterMode] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [quickEditDocumentMode, setQuickEditDocumentMode] = useState(false);
  const [aiPickMode, setAiPickMode] = useState(false);
  const [designReviewMode, setDesignReviewMode] = useState(false);

  const flags: ContentAppModeFlags = {
    aiPickMode,
    designReviewMode,
    highlighterMode,
    quickEditDocumentMode,
    quickEditMode,
    screenshotMode,
  };
  const controls: ContentAppModeControls = {
    setAiPickMode,
    setDesignReviewMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
    setScreenshotMode,
  };

  return { controls, flags };
}
