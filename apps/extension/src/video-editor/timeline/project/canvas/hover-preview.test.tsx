// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../features/video/project/factories/creation';
import { createSceneSelection } from '../../../project/selection/model';
import { ProjectTimelineCanvas } from './';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
});

it('renders hover preview on empty canvas and suppresses it over marked timeline objects', () => {
  const canvas = renderCanvas();

  movePointer(canvas, 90);

  expect(getHoverPreview()?.getAttribute('style')).toContain('left: 90px');

  act(() => {
    const marker = document.createElement('div');
    marker.setAttribute('data-timeline-object', 'true');
    canvas?.appendChild(marker);
    dispatchPointerEvent(marker, 'pointermove', 90);
  });

  expect(getHoverPreview()).toBeNull();
});

it('clears hover preview when the timeline canvas is pressed or left', () => {
  const canvas = renderCanvas();

  movePointer(canvas, 120);
  expect(getHoverPreview()).toBeTruthy();

  act(() => {
    canvas?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  });
  expect(getHoverPreview()).toBeNull();

  movePointer(canvas, 120);
  act(() => {
    canvas?.dispatchEvent(new Event('pointerout', { bubbles: true }));
  });
  expect(getHoverPreview()).toBeNull();
});

function renderCanvas() {
  const project = createEmptyVideoProject('Canvas hover');
  const actions = createCanvasTestActions();

  act(() => {
    root?.render(
      <ProjectTimelineCanvas
        currentTime={0}
        dragGhost={null}
        playbackRange={null}
        pixelsPerSecond={90}
        project={project}
        recordingTelemetry={null}
        selection={createSceneSelection()}
        hoveredClipId={null}
        selectedClipId={null}
        selectedEffectSelection={null}
        selectedTrackId={null}
        telemetryLaneVisible={false}
        timelinePreviews={{}}
        seekToClientX={vi.fn()}
        timelineRef={{ current: null }}
        timelineWidth={900}
        tracks={project.tracks}
        {...actions}
      />
    );
  });

  return container?.querySelector<HTMLDivElement>('.relative.min-w-0.overflow-auto') ?? null;
}

function createCanvasTestActions() {
  return {
    onBeginClipInteraction: vi.fn(),
    onBeginEffectInteraction: vi.fn(),
    onBeginEffectRangeSelection: vi.fn(),
    onBeginRangeSelection: vi.fn(),
    onBeginTrackRangeSelection: () => vi.fn(),
    onAddMotionRegion: vi.fn(),
    onCloseTrackGap: vi.fn(),
    onImportTimelineFile: { audio: vi.fn(), image: vi.fn(), video: vi.fn() },
    onSeek: vi.fn(),
    onSelectActionSegment: vi.fn(),
    onSelectClip: vi.fn(),
    onSelectCursorSegment: vi.fn(),
    onSelectMotionRegion: vi.fn(),
    onSelectObjectTrack: vi.fn(),
    onSelectScene: vi.fn(),
    onSelectTrack: vi.fn(),
    onSelectTransition: vi.fn(),
    onSetHoveredClipId: vi.fn(),
    onTimelinePreviewViewportChange: vi.fn(),
    onResizeActionEvent: vi.fn(),
    onResizeMotionRegion: vi.fn(),
    onScroll: vi.fn(),
    onUnsupportedTimelineFileDrop: vi.fn(),
  };
}

function movePointer(target: Element | null, clientX: number) {
  act(() => {
    dispatchPointerEvent(target, 'pointermove', clientX);
  });
}

function dispatchPointerEvent(target: Element | null, type: string, clientX: number) {
  const pointerEvent = new Event(type, { bubbles: true });
  Object.defineProperty(pointerEvent, 'clientX', { value: clientX });
  target?.dispatchEvent(pointerEvent);
}

function getHoverPreview() {
  return container?.querySelector('[data-timeline-hover-preview="true"]') ?? null;
}
