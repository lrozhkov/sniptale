// @vitest-environment jsdom

import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

const history = vi.hoisted(() => ({
  canUndo: true,
  canRedo: false,
  onUndo: vi.fn(),
  onRedo: vi.fn(),
}));
vi.mock('../../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../runtime/controller/composition/hooks')>()),
  useVideoEditorHistoryController: () => history,
  useVideoEditorHeaderController: () => ({
    grid: { magnetEnabled: true, onToggleMagnet: vi.fn() },
    onOpenExportDialog: vi.fn(),
  }),
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
    playback: {
      currentTime: 0,
      duration: 8,
      isPlaying: false,
      playbackRange: null,
      onSeekToEnd: vi.fn(),
      onSeekToStart: vi.fn(),
      onTogglePlay: vi.fn(),
      onStepToNextFrame: vi.fn(),
      onStepToPreviousFrame: vi.fn(),
    },
    canAutoTransformRecording: true,
    canAddMotionRegion: true,
    hasMotionRegions: false,
    canEditSelectedClip: true,
    canSplitSelectedClip: true,
    fitSelectionDuration: 8,
    insertion: createInsertionActions(),
    onAutoTransformRecording: vi.fn(),
    onDeleteSelectedClip: vi.fn(),
    onDuplicateSelectedClip: vi.fn(),
    onFitProject: vi.fn(),
    onFitSelection: vi.fn(),
    onSplitSelectedClip: vi.fn(),
    onTimelinePreviewSuspendedChange: vi.fn(),
    onZoomChange: vi.fn(),
    pixelsPerSecond: 120,
    selectedClip: true,
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

it('keeps editing, playback and view controls together in the timeline header', () => {
  const renderedContainer = renderToolbar();

  const toolbar = renderedContainer.firstElementChild as HTMLDivElement | null;
  const regions = toolbar ? Array.from(toolbar.children) : [];
  expect(regions[0]?.textContent).not.toContain('videoEditor.timeline.addButton');
  expect(regions[0]?.textContent).not.toContain('videoEditor.timeline.addTrack');
  expect(regions[0]?.textContent).toContain('videoEditor.timeline.addZoomRegion');
  expect(regions[0]?.textContent).toContain('videoEditor.timeline.split');
  expect(regions).toHaveLength(3);
  expect(toolbar?.querySelector('[data-playback-counter]')).not.toBeNull();
  expect(regions[2]?.textContent).not.toContain('videoEditor.timeline.telemetryToggle');
  expect(
    regions[2]?.querySelector('[data-ui="video-editor.timeline.toolbar.fit-project"]')
  ).not.toBeNull();
  expect(regions[2]?.querySelector('input[aria-label="videoEditor.timeline.zoom"]')).not.toBeNull();
});

it('routes available history actions from the timeline and disables unavailable redo', () => {
  const rendered = renderToolbar();
  const undo = rendered.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.toolbar.undo"]'
  );
  const redo = rendered.querySelector<HTMLButtonElement>(
    '[data-ui="video-editor.timeline.toolbar.redo"]'
  );
  expect(undo).not.toBeNull();
  expect(redo).not.toBeNull();
  expect(undo?.disabled).toBe(false);
  expect(redo?.disabled).toBe(true);
  act(() => {
    undo?.click();
    redo?.click();
  });
  expect(history.onUndo).toHaveBeenCalledTimes(1);
  expect(history.onRedo).not.toHaveBeenCalled();
});
