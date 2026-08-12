import { useState } from 'react';
import type { ContentAppModeControls, ContentAppModeFlags } from './types';

export function useContentModeFlags() {
  const [screenshotMode, setScreenshotMode] = useState(false);
  const [highlighterMode, setHighlighterMode] = useState(false);
  const [quickEditMode, setQuickEditMode] = useState(false);
  const [quickEditDocumentMode, setQuickEditDocumentMode] = useState(false);
  const [aiPickMode, setAiPickMode] = useState(false);
  const [designReviewMode, setDesignReviewMode] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [videoRecordingMode, setVideoRecordingMode] = useState(false);

  const flags: ContentAppModeFlags = {
    aiPickMode,
    designReviewMode,
    drawingMode,
    highlighterMode,
    quickEditDocumentMode,
    quickEditMode,
    screenshotMode,
    videoRecordingMode,
  };
  const controls: ContentAppModeControls = {
    setAiPickMode,
    setDesignReviewMode,
    setDrawingMode,
    setHighlighterMode,
    setQuickEditDocumentMode,
    setQuickEditMode,
    setScreenshotMode,
    setVideoRecordingMode,
  };

  return { controls, flags };
}
