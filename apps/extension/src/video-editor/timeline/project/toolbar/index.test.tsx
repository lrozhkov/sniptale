// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

import { ProjectTimelineToolbar } from './index';

type ProjectTimelineToolbarTestProps = ComponentProps<typeof ProjectTimelineToolbar>;

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

function createInsertionActions() {
  return {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddShapeOverlay: vi.fn(),
    onAddTextOverlay: vi.fn(),
    onAddTrack: vi.fn(),
    onEnableCursorTrack: vi.fn(),
    onImport: {
      audio: vi.fn(),
      image: vi.fn(),
      video: vi.fn(),
    },
    onUnsupportedFileDrop: vi.fn(),
  };
}

function createToolbarProps(): ProjectTimelineToolbarTestProps {
  return {
    canAutoTransformRecording: true,
    currentTime: 12,
    duration: 45,
    fitSelectionDuration: 8,
    insertion: createInsertionActions(),
    isPlaying: false,
    onAutoTransformRecording: vi.fn(),
    onClearPlaybackRange: vi.fn(),
    onDeleteSelectedClip: vi.fn(),
    onDuplicateSelectedClip: vi.fn(),
    onFitProject: vi.fn(),
    onFitSelection: vi.fn(),
    onSeekToStart: vi.fn(),
    onSplitSelectedClip: vi.fn(),
    onTimelinePreviewSuspendedChange: vi.fn(),
    onTogglePlay: vi.fn(),
    onZoomChange: vi.fn(),
    pixelsPerSecond: 120,
    playbackRange: null,
    selectedClip: true,
    trackView: {
      compactRows: false,
      panelExpanded: false,
      onCompactRowsChange: vi.fn(),
      onPanelExpandedChange: vi.fn(),
    },
    visibleRangeSeconds: 8,
  };
}

function renderToolbar() {
  const nextContainer = document.createElement('div');
  container = nextContainer;
  document.body.appendChild(nextContainer);
  root = createRoot(nextContainer);

  act(() => {
    root?.render(<ProjectTimelineToolbar {...createToolbarProps()} />);
  });

  return nextContainer;
}

it('keeps add actions left, playback center, and zoom on the right', () => {
  const renderedContainer = renderToolbar();

  const toolbar = renderedContainer.firstElementChild as HTMLDivElement | null;
  const regions = toolbar ? Array.from(toolbar.children) : [];
  expect(toolbar?.className).toContain('max-[720px]:grid-cols-1');
  expect(regions[0]?.querySelector('div')?.className).toContain('max-[720px]:gap-1');
  expect(regions[1]?.className).toContain('max-[720px]:justify-start');
  expect(regions[2]?.className).toContain('max-[720px]:justify-start');
  expect(regions[0]?.textContent).not.toContain('videoEditor.timeline.addButton');
  expect(regions[0]?.textContent).toContain('videoEditor.timeline.addTrack');
  expect(regions[0]?.textContent).not.toContain('videoEditor.timeline.addZoomRegion');
  expect(regions[0]?.textContent).toContain('videoEditor.timeline.split');
  expect(regions[1]?.textContent).toContain('0:12.0 / 0:45.0');
  expect(regions[2]?.textContent).not.toContain('videoEditor.timeline.telemetryToggle');
  expect(
    regions[2]?.querySelector('[data-ui="video-editor.timeline.toolbar.fit-project"]')
  ).not.toBeNull();
  expect(regions[2]?.querySelector('input[aria-label="videoEditor.timeline.zoom"]')).not.toBeNull();
});
