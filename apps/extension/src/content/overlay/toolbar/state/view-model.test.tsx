// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ToolbarProps } from '../types';
import { useToolbarViewModel } from './view-model';

const toolbarProps: ToolbarProps = {
  captureAction: 'copy',
  currentViewport: null,
  designReviewMode: true,
  onAiPickContentStart: vi.fn(),
  onClearHighlights: vi.fn(),
  onHide: vi.fn(),
  onTakeScreenshot: vi.fn(),
  onTimerDelayChange: vi.fn(),
  onToggleDesignReviewMode: vi.fn(),
  onToggleHighlighterMode: vi.fn(),
  onToggleQuickEditDocumentMode: vi.fn(),
  onToggleQuickEditMode: vi.fn(),
  onToggleScreenshotMode: vi.fn(),
  timerDelay: 0,
};

let container: HTMLDivElement;
let latest: ReturnType<typeof useToolbarViewModel> | null;
let root: Root;

function Harness() {
  latest = useToolbarViewModel(toolbarProps);
  return null;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  latest = null;
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('projects Design Review mode and capture actions through narrow public roles', () => {
  act(() => root.render(<Harness />));

  expect(latest?.designReviewMode).toBe(true);
  expect(latest?.capture.action).toBe('copy');

  act(() => latest?.capture.setAction('download_default'));
  expect(latest?.capture.action).toBe('download_default');
});
