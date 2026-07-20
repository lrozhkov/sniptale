// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ProjectTimelineToolbarTrailingActions } from './trailing';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
});

function renderTrailingActions() {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const handlers = {
    onCompactRowsChange: vi.fn(),
    onFitProject: vi.fn(),
    onFitSelection: vi.fn(),
    onPanelExpandedChange: vi.fn(),
    onZoomChange: vi.fn(),
  };

  act(() => {
    root?.render(
      <ProjectTimelineToolbarTrailingActions
        fitSelectionDuration={4}
        pixelsPerSecond={120}
        trackView={{
          compactRows: false,
          panelExpanded: false,
          onCompactRowsChange: handlers.onCompactRowsChange,
          onPanelExpandedChange: handlers.onPanelExpandedChange,
        }}
        visibleRangeSeconds={8}
        onFitProject={handlers.onFitProject}
        onFitSelection={handlers.onFitSelection}
        onTimelinePreviewSuspendedChange={vi.fn()}
        onZoomChange={handlers.onZoomChange}
      />
    );
  });

  return handlers;
}

it('renders zoom without the removed speed and telemetry controls', () => {
  renderTrailingActions();

  const zoomRange = container?.querySelector('input[aria-label="videoEditor.timeline.zoom"]');
  expect(zoomRange).not.toBeNull();
  expect(container?.textContent).not.toContain('videoEditor.timeline.telemetryToggle');
  expect(container?.textContent).not.toContain('videoEditor.timeline.speedLabel');
  expect(zoomRange?.parentElement?.className).not.toContain('border');
  expect(zoomRange?.parentElement?.className).not.toContain('bg-');
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.toolbar.fit-project"]')
  ).not.toBeNull();
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.toolbar.compact-tracks"]')
  ).not.toBeNull();
});

it('routes timeline view actions from the trailing side', () => {
  const handlers = renderTrailingActions();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.fit-project"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.fit-selection"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.compact-tracks"]')
      ?.click();
    container
      ?.querySelector<HTMLButtonElement>(
        '[data-ui="video-editor.timeline.toolbar.expand-track-panel"]'
      )
      ?.click();
  });

  expect(handlers.onFitProject).toHaveBeenCalledTimes(1);
  expect(handlers.onFitSelection).toHaveBeenCalledTimes(1);
  expect(handlers.onCompactRowsChange).toHaveBeenCalledWith(true);
  expect(handlers.onPanelExpandedChange).toHaveBeenCalledWith(true);
});
