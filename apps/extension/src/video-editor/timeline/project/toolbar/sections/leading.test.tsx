import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
// @vitest-environment jsdom
import { ProjectTimelineAddTrackControl } from './add-controls';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
import { VideoTrackKind, VideoProjectTrackRole } from '../../../../../features/video/project/types';
import { ProjectTimelineToolbarLeadingControls } from './leading';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
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

function renderLeadingControls(options?: {
  historySelected?: boolean;
  historyLocked?: boolean;
  canAddMotionRegion?: boolean;
  canDeleteSelectedClip?: boolean;
  canEditSelectedClip?: boolean;
  canSplitSelectedClip?: boolean;
  selectedClip?: boolean;
}) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const handlers = {
    onAddActionEvent: vi.fn(),
    onAddMotionRegion: vi.fn(),
    onAddTrack: vi.fn(),
    onToggleTelemetryLaneVisibility: vi.fn(),
    onZoomChange: vi.fn(),
  };

  const project = createEmptyVideoProject();
  project.utilityLanes = {
    actions: { visible: true, locked: options?.historyLocked ?? false },
    camera: { visible: true, locked: false },
  };
  act(() => {
    root?.render(
      <>
        <ProjectTimelineAddTrackControl onAddTrack={handlers.onAddTrack} />
        <ProjectTimelineToolbarLeadingControls
          historySelected={options?.historySelected ?? false}
          historyActions={{
            project,
            selection: { kind: 'history-lane' },
            actions: {
              prepare: async () => ({ status: 'stale' }),
              apply: async () => 'stale',
              isCurrent: () => false,
            },
            onSeek: vi.fn(),
            onModalVisibilityChange: vi.fn(),
          }}
          canAddMotionRegion={options?.canAddMotionRegion ?? true}
          canDeleteSelectedClip={options?.canDeleteSelectedClip ?? options?.selectedClip ?? false}
          canEditSelectedClip={options?.canEditSelectedClip ?? options?.selectedClip ?? false}
          canSplitSelectedClip={options?.canSplitSelectedClip ?? options?.selectedClip ?? false}
          insertion={{
            onAddActionEvent: handlers.onAddActionEvent,
            onAddMotionRegion: handlers.onAddMotionRegion,
            onAddShapeOverlay: vi.fn(),
            onAddTextOverlay: vi.fn(),
            onAddTrack: handlers.onAddTrack,
            onEnableCursorTrack: vi.fn(),
            onImport: {
              audio: vi.fn(),
              image: vi.fn(),
              video: vi.fn(),
            },
            onUnsupportedFileDrop: vi.fn(),
          }}
          selectedClip={options?.selectedClip ?? false}
          onDeleteSelectedClip={vi.fn()}
          onDuplicateSelectedClip={vi.fn()}
          onSplitSelectedClip={handlers.onZoomChange}
        />
      </>
    );
  });

  return handlers;
}

function getButtonByText(label: string): HTMLButtonElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
    (item) => item.textContent?.includes(label)
  );

  if (!button) {
    throw new Error(`Missing button: ${label}`);
  }

  return button;
}

it('renders clip actions without the history auto-processing control in the toolbar', () => {
  renderLeadingControls();

  expect(container?.textContent).not.toContain('videoEditor.timeline.addButton');
  expect(container?.textContent).toContain('videoEditor.timeline.addTrack');
  expect(container?.textContent).not.toContain('videoEditor.timeline.autoTransform');
  expect(getButtonByText('videoEditor.timeline.split').disabled).toBe(true);
});

it('reveals clip actions only for an active clip selection', () => {
  renderLeadingControls({ selectedClip: false });
  expect(getButtonByText('videoEditor.timeline.split').disabled).toBe(true);

  renderLeadingControls({ selectedClip: true });
  expect(container?.textContent).toContain('videoEditor.timeline.split');
  expect(container?.textContent).toContain('videoEditor.timeline.duplicate');
  expect(container?.textContent).toContain('videoEditor.timeline.delete');
});

it('wires clip actions from the leading side', () => {
  const handlers = renderLeadingControls({
    selectedClip: true,
  });

  act(() => {
    getButtonByText('videoEditor.timeline.split').click();
  });

  expect(handlers.onZoomChange).toHaveBeenCalledTimes(1);
});

it('wires track creation from the track header control', () => {
  const handlers = renderLeadingControls();
  const trigger = getButtonByText('videoEditor.timeline.addTrack');

  act(() => {
    trigger.click();
  });

  expect(handlers.onAddTrack).not.toHaveBeenCalled();
  expect(document.querySelector('.sniptale-toolbar-menu')).not.toBeNull();
  expect(document.body.textContent).toContain('videoEditor.timeline.addVideoTrack');
  expect(document.body.textContent).toContain('videoEditor.timeline.addVideoTrackNote');
  expect(document.body.textContent).toContain('videoEditor.timeline.addAudioTrack');
  expect(document.body.textContent).toContain('videoEditor.timeline.addAudioTrackNote');
  expect(document.body.textContent).not.toContain('videoEditor.timeline.addOverlayTrack');
  expect(document.body.textContent).not.toContain('videoEditor.timeline.addOverlayTrackNote');
  expect(document.body.textContent).not.toContain('videoEditor.timeline.addSubtitleTrack');
  expect(
    document.querySelectorAll(
      '.sniptale-toolbar-menu-item[data-ui^="video-editor.timeline.toolbar.add-track."]'
    )
  ).toHaveLength(3);

  act(() => {
    getButtonByText('videoEditor.timeline.addAudioTrack').click();
  });

  expect(handlers.onAddTrack).toHaveBeenCalledWith(VideoTrackKind.AUDIO);
  expect(document.querySelector('.sniptale-toolbar-menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('restores focus to the add-track trigger when Escape dismisses the menu', () => {
  renderLeadingControls();
  const trigger = getButtonByText('videoEditor.timeline.addTrack');

  act(() => {
    trigger.click();
  });

  act(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });

  expect(document.querySelector('.sniptale-toolbar-menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it('adds zoom at the playhead through the explicit toolbar action', () => {
  const handlers = renderLeadingControls();
  act(() => getButtonByText('videoEditor.timeline.addZoomRegion').click());
  expect(handlers.onAddMotionRegion).toHaveBeenCalledWith();
});

it('does not add zoom while its lane is unavailable for editing', () => {
  const handlers = renderLeadingControls({ canAddMotionRegion: false });
  const button = getButtonByText('videoEditor.timeline.addZoomRegion');
  expect(button.disabled).toBe(true);
  act(() => button.click());
  expect(handlers.onAddMotionRegion).not.toHaveBeenCalled();
});

it('dismisses track choices on captured outside pointerdown without stealing focus', () => {
  renderLeadingControls();
  const trigger = getButtonByText('videoEditor.timeline.addTrack');
  const outside = document.createElement('button');
  document.body.appendChild(outside);
  outside.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  try {
    act(() => trigger.click());
    outside.focus();
    act(() =>
      outside.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    );
    expect(document.querySelector('.sniptale-toolbar-menu')).toBeNull();
    expect(document.activeElement).toBe(outside);
    act(() => trigger.click());
    expect(document.querySelector('.sniptale-toolbar-menu')).not.toBeNull();
    act(() => trigger.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
    expect(document.querySelector('.sniptale-toolbar-menu')).not.toBeNull();
    act(() => trigger.click());
    expect(document.querySelector('.sniptale-toolbar-menu')).toBeNull();
  } finally {
    outside.remove();
  }
});

it('keeps track choices open while the timeline layout settles after opening', () => {
  const observers: Array<{ callback: ResizeObserverCallback; target?: Element }> = [];
  vi.stubGlobal(
    'ResizeObserver',
    class {
      entry: (typeof observers)[number];
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback };
        observers.push(this.entry);
      }
      observe(target: Element) {
        this.entry.target = target;
      }
      disconnect() {}
    }
  );
  renderLeadingControls();
  container!.setAttribute('data-ui', 'video-editor.timeline.surface');
  let width = 1000;
  vi.spyOn(container!, 'getBoundingClientRect').mockImplementation(
    () => new DOMRect(0, 0, width, 300)
  );
  act(() => getButtonByText('videoEditor.timeline.addTrack').click());
  width = 999;
  act(() => {
    for (const entry of observers) {
      if (entry.target === container) entry.callback([], {} as ResizeObserver);
    }
  });
  expect(document.querySelector('.sniptale-toolbar-menu')).not.toBeNull();
});

it('offers history actions only for the selected history lane and honors its lock', () => {
  renderLeadingControls({ historySelected: false });
  expect(container?.querySelector('[data-ui="video-editor.auto.open"]')).toBeNull();
  expect(
    container?.querySelector('[data-ui="video-editor.timeline.toolbar.add-click"]')
  ).toBeNull();
  const handlers = renderLeadingControls({ historySelected: true });
  expect(container?.querySelector('[data-ui="video-editor.auto.open"]')).not.toBeNull();
  act(() =>
    container
      ?.querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.add-click"]')
      ?.click()
  );
  expect(handlers.onAddActionEvent).toHaveBeenCalledWith('CLICK_RIPPLE');
  renderLeadingControls({ historySelected: true, historyLocked: true });
  expect(
    container?.querySelector<HTMLButtonElement>(
      '[data-ui="video-editor.timeline.toolbar.add-click"]'
    )?.disabled
  ).toBe(true);
});

it('creates a camera track from the menu and restores the trigger focus', () => {
  const handlers = renderLeadingControls();
  const trigger = getButtonByText('videoEditor.timeline.addTrack');
  act(() => trigger.click());
  act(() => getButtonByText('videoEditor.timeline.addCameraTrack').click());
  expect(handlers.onAddTrack).toHaveBeenCalledWith(
    VideoTrackKind.PRIMARY,
    VideoProjectTrackRole.CAMERA
  );
  expect(document.querySelector('.sniptale-toolbar-menu')).toBeNull();
  expect(document.activeElement).toBe(trigger);
});
