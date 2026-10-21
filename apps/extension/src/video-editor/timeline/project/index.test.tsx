import {
  createVideoProjectTrack,
  createVideoProjectAsset,
} from '../../../features/video/project/factories/creation';
import { buildReviewTimeMap } from '../../../features/video/review/timeline';
// @vitest-environment jsdom

import { act, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createTimelineTestProps as createProps } from './test-support';
import { DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS } from '../../persistence/track-panel';
import { ProjectTimeline } from './index';

vi.mock('../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

// The composition boundary supplies unrelated workspace commands; timeline composition stays real.
vi.mock('../../runtime/controller/composition/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../runtime/controller/composition/hooks')>()),
  useVideoEditorTimelineController: () => null,
  useVideoEditorAutosaveController: () => ({ enabled: true, onChange: vi.fn() }),
  useVideoEditorHistoryController: () => ({
    canUndo: false,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
  }),
  useVideoEditorHeaderController: () => ({
    saveStateMeta: { state: 'saved' },
    grid: { magnetEnabled: false, onToggleMagnet: vi.fn() },
    onOpenExportDialog: vi.fn(),
  }),
  useVideoEditorProjectMenuController: () => ({
    onCreateProject: vi.fn(),
    onDialogVisibilityChange: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountTimeline(props: ComponentProps<typeof ProjectTimeline>) {
  function Harness() {
    const [scale, setScale] = useState(props.pixelsPerSecond);
    return <ProjectTimeline {...props} pixelsPerSecond={scale} onZoomChange={setScale} />;
  }
  act(() => root.render(<Harness />));
  act(() =>
    container
      .querySelector<HTMLButtonElement>('[data-ui="video-editor.timeline.toolbar.fit-selection"]')!
      .click()
  );
}

function pointer(target: EventTarget, type: string, x: number) {
  const event = new Event(type, { bubbles: true });
  Object.defineProperties(event, {
    clientX: { value: x },
    clientY: { value: 20 },
    button: { value: 0 },
  });
  target.dispatchEvent(event);
}

it('composes precise fit, clip draft cancellation and commit through the real timeline body', () => {
  const props = createProps();
  mountTimeline(props);
  const clip = container.querySelector<HTMLElement>('[data-project-timeline-clip="clip"]')!;
  expect(clip).not.toBeNull();
  expect(parseFloat(clip.style.width)).toBeCloseTo(96, 3);

  const before = structuredClone(props.project);
  act(() => {
    pointer(clip, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
  });
  const ghost = () =>
    container.querySelector<HTMLElement>('[data-ui="video-editor.timeline.clip-drag-ghost"]');
  expect(ghost()).not.toBeNull();
  expect(parseFloat(ghost()!.style.width)).toBeCloseTo(96, 3);
  expect(props.onMoveClip).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(window, 'pointerup', 576);
  });
  expect(ghost()).toBeNull();
  expect(props.onMoveClip).not.toHaveBeenCalled();
  act(() => {
    pointer(clip, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
    pointer(window, 'pointerup', 576);
  });
  expect(props.onMoveClip).toHaveBeenCalledWith(
    'clip',
    expect.closeTo(43200 + 1 / 240, 6),
    props.project.tracks[0]!.id,
    'line-1'
  );
  expect(props.project).toEqual(before);
});

it('publishes an effect draft through the root context and restores its original geometry on Escape', () => {
  const props = createProps();
  mountTimeline(props);
  const segment = container.querySelector<HTMLElement>('[data-timeline-effect-segment="motion"]')!;
  expect(segment).not.toBeNull();
  const originalLeft = segment.style.left;
  const button = segment.querySelector<HTMLButtonElement>(
    '[aria-label^="videoEditor.timeline.motionSegment ·"]'
  )!;
  act(() => {
    pointer(button, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
  });
  expect(segment.style.left).not.toBe(originalLeft);
  expect(props.onMoveMotionRegion).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    pointer(window, 'pointerup', 576);
  });
  expect(segment.style.left).toBe(originalLeft);
  expect(props.onMoveMotionRegion).not.toHaveBeenCalled();
  act(() => {
    pointer(button, 'pointerdown', 480);
    pointer(window, 'pointermove', 576);
    pointer(window, 'pointerup', 576);
  });
  expect(props.onMoveMotionRegion).toHaveBeenCalledWith(
    'motion',
    expect.closeTo(43200 + 1 / 240, 6)
  );
});

it('shows authored history by default without a sidecar and respects explicit collapse', () => {
  const props = createProps();
  props.panelPrefs.telemetryLaneVisible =
    DEFAULT_VIDEO_EDITOR_TRACK_PANEL_PREFS.collapsedTelemetryLaneVisible;
  props.project.actionEvents = [
    {
      id: 'captured',
      anchor: { kind: 'project', time: 43200 },

      kind: 'CLICK',

      label: 'Open',
      point: null,
      data: {},
      presentation: { duration: 0.4, preset: 'CLICK_RIPPLE' },
    },
  ];
  mountTimeline(props);
  expect(container.querySelector('[data-ui="video-editor.timeline.history-row"]')).not.toBeNull();
  act(() =>
    root.render(
      <ProjectTimeline
        {...props}
        panelPrefs={{ ...props.panelPrefs, telemetryLaneVisible: false }}
      />
    )
  );
  expect(container.querySelector('[data-ui="video-editor.timeline.history-row"]')).toBeNull();
  expect(props.project.actionEvents).toHaveLength(1);
});

it('keeps enabled empty history selectable for adding the first click', () => {
  const props = createProps();
  props.panelPrefs.telemetryLaneVisible = true;
  mountTimeline(props);
  expect(container.querySelector('[data-ui="video-editor.timeline.history-row"]')).not.toBeNull();
  expect(container.querySelector('[data-ui="video-editor.timeline.history-lane"]')).not.toBeNull();
});

it('sizes the track rail by names independently of row height', () => {
  for (const compactRows of [false, true]) {
    let namedHeight: string | undefined;
    for (const hideTrackNames of [false, true]) {
      const props = createProps();
      props.panelPrefs.prefs = { ...props.panelPrefs.prefs, compactRows, hideTrackNames };
      mountTimeline(props);
      const rail = container.querySelector('[data-project-timeline-track-list]')!;
      const body = rail.parentElement!.parentElement!;
      expect(body.style.gridTemplateColumns).toBe(
        hideTrackNames ? '136px minmax(0,1fr)' : '220px minmax(0,1fr)'
      );
      const header = container.querySelector(
        '[data-ui="video-editor.timeline.track-header-controls"]'
      )!;
      expect(header.previousElementSibling?.classList.contains('sr-only')).toBe(hideTrackNames);
      const row = rail.querySelector(
        '[data-ui="video-editor.timeline.track-select"]'
      )!.parentElement!;
      if (!hideTrackNames) namedHeight = row.style.height;
      else expect(row.style.height).toBe(namedHeight);
    }
  }
});

it.each([false, true])(
  'fits all current voice occurrences instead of a stale clip selection; dormant=%s',
  (dormant) => {
    const props = createProps();
    const project = props.project;
    const source = project.clips[0]!;
    if (source.type !== 'VIDEO') throw new Error('Missing source');
    source.duration = 2;
    source.sourceDuration = 2;
    source.sourceInstanceId = 'instance';
    project.clips.push({
      ...source,
      id: 'second',
      startTime: source.startTime + 10,
      sourceStart: 2,
    });
    const track = createVideoProjectTrack('Voice', 2, 'AUDIO');
    const audio = createVideoProjectAsset(
      'Voice',
      'AUDIO',
      { kind: 'project-asset', projectAssetId: 'voice' },
      {
        width: 0,
        height: 0,
        duration: 4,
        mimeType: 'audio/wav',
        size: 1,
        hasAudio: true,
        audioPeaks: null,
      }
    );
    project.tracks.push(track);
    project.assets.push(audio);
    project.version = 31;
    project.sourceVoiceoverDocuments = [
      {
        id: 'doc',
        trackId: track.id,
        enabled: false,
        binding: { kind: 'source', assetId: source.assetId, sourceInstanceId: 'instance' },
        reference: buildReviewTimeMap(4, []),
        take: {
          id: 'take',
          assetId: audio.id,
          timelineStart: 0,
          sourceOffset: 0,
          duration: 4,
          volume: 1,
          muted: false,
          fadeIn: 0,
          fadeOut: 0,
          dormant,
          sourceAnchor: [{ start: 0, end: 4, offset: 0, duration: 4 }],
        },
      },
    ];
    props.selection = { kind: 'source-voiceover', documentId: 'doc' };
    const before = structuredClone(project);
    const selection = props.selection;
    mountTimeline(props);
    const fit = container.querySelector<HTMLButtonElement>(
      '[data-ui="video-editor.timeline.toolbar.fit-selection"]'
    )!;
    expect(fit.disabled).toBe(dormant);
    if (!dormant) {
      const clip = container.querySelector<HTMLElement>('[data-project-timeline-clip="clip"]')!;
      expect(clip).not.toBeNull();
      expect(parseFloat(clip.style.width)).toBeCloseTo(144, 3);
      expect(container.querySelectorAll('[data-source-voiceover-document="doc"]')).toHaveLength(2);
    }
    expect(project).toEqual(before);
    expect(props.selection).toBe(selection);
    expect(props.onSeek).not.toHaveBeenCalled();
  }
);
