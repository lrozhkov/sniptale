// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProjectCursorFocusKeys } from './cursor-focus-keys';
import { useVideoEditorStore } from '../../../state/store';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { resolveProjectCursorFocus } from '../../../../features/video/project/cursor-focus-path/projection';
import { createTimelineProjection } from '../interaction-state/projection';
vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
  getCurrentLocale: () => 'en',
  useAppLocale: () => 'en',
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers();
  initial = useVideoEditorStore.getState();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('adds a gap key once with source facts and selection preserved', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'r',
    filename: 'keys.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'start',
          time: 0,
          x: 20,
          y: 20,
          visible: true,
          recordingPoint: { x: 0.2, y: 0.2 },
          observation: 'observed',
          captureSegment: 0,
        },
        {
          id: 'loss',
          time: 1,
          x: 20,
          y: 20,
          visible: false,
          recordingPoint: null,
          observation: 'outside',
          captureSegment: 0,
        },
        {
          id: 'return',
          time: 3,
          x: 80,
          y: 80,
          visible: true,
          recordingPoint: { x: 0.8, y: 0.8 },
          observation: 'observed',
          captureSegment: 1,
        },
      ],
    },
  });
  useVideoEditorStore.getState().setProject(project);
  const facts = structuredClone(useVideoEditorStore.getState().project!.cursorTrack);
  act(() =>
    root.render(
      <ProjectCursorFocusKeys
        project={useVideoEditorStore.getState().project!}
        pixelsPerSecond={100}
      />
    )
  );
  vi.spyOn(
    host.querySelector('[data-ui="cursorFocusPath.timelineKeys"]')!,
    'getBoundingClientRect'
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 400,
    height: 24,
    right: 400,
    bottom: 24,
    toJSON: () => ({}),
  });
  const row = host.querySelector<HTMLButtonElement>(
    'button[title="videoEditor.sidebar.cursorFocusRowHint"]'
  )!;
  act(() =>
    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2, clientX: 200 }))
  );
  const state = useVideoEditorStore.getState();
  expect(state.projectHistory.past).toHaveLength(1);
  expect(state.project!.cursorTrack).toEqual(facts);
  const key = state.project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)[0]!;
  expect(key).toMatchObject({ time: 2, anchor: 'manual' });
  expect(state.selection).toMatchObject({ kind: 'cursor-segment', sampleId: key.id });
  expect(state.currentTime).toBe(2);
  expect(resolveProjectCursorFocus(state.project!, 2)).toMatchObject({ x: 50, y: 50 });
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.cursorFocusPath).toBeUndefined();
  expect(useVideoEditorStore.getState().project!.cursorTrack).toEqual(facts);
});

it('keeps a manual no-observation-track key selectable and deletable through existing history after reopen', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'r',
    filename: 'unknown-cursor.webm',
    width: 100,
    height: 100,
    duration: 4,
    mimeType: 'video/webm',
    size: 100,
  });
  useVideoEditorStore.getState().setProject(project);
  act(() =>
    root.render(
      <ProjectCursorFocusKeys
        project={useVideoEditorStore.getState().project!}
        pixelsPerSecond={100}
      />
    )
  );
  vi.spyOn(
    host.querySelector('[data-ui="cursorFocusPath.timelineKeys"]')!,
    'getBoundingClientRect'
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    width: 400,
    height: 24,
    right: 400,
    bottom: 24,
    toJSON: () => ({}),
  });
  act(() =>
    host
      .querySelector('button')!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2, clientX: 200 }))
  );
  const authored = useVideoEditorStore.getState().project!;
  const key = authored.cursorFocusPath!.segments[0]!.keys[0]!;
  act(() => {
    useVideoEditorStore.getState().setProject(structuredClone(authored));
    useVideoEditorStore.getState().selectCursorSegment(key.id);
  });
  expect(useVideoEditorStore.getState().selection).toMatchObject({
    kind: 'cursor-segment',
    sampleId: key.id,
  });
  act(() => useVideoEditorStore.getState().deleteCursorSample(key.id));
  expect(useVideoEditorStore.getState().project!.cursorFocusPath!.segments).toEqual([]);
  expect(useVideoEditorStore.getState().project!.cursorTrack).toBeNull();
  expect(useVideoEditorStore.getState().project!.source).toEqual(authored.source);
});

it('projects visible keys and authors absolute times once in a scrolled timeline', () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'scrolled',
    filename: 'scrolled.webm',
    width: 100,
    height: 100,
    duration: 12,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'before',
          time: 0,
          x: 20,
          y: 20,
          visible: true,
          recordingPoint: { x: 0.2, y: 0.2 },
          observation: 'observed',
          captureSegment: 0,
        },
        {
          id: 'visible',
          time: 6,
          x: 80,
          y: 20,
          visible: true,
          recordingPoint: { x: 0.8, y: 0.2 },
          observation: 'observed',
          captureSegment: 0,
        },
        {
          id: 'after',
          time: 10,
          x: 20,
          y: 80,
          visible: true,
          recordingPoint: { x: 0.2, y: 0.8 },
          observation: 'observed',
          captureSegment: 0,
        },
      ],
    },
  });
  useVideoEditorStore.getState().setProject(project);
  const facts = structuredClone(useVideoEditorStore.getState().project!.cursorTrack);
  const projection = createTimelineProjection({
    extentSeconds: 12,
    pixelsPerSecond: 100,
    viewportWidth: 400,
    startTime: 4,
  });
  act(() =>
    root.render(
      <ProjectCursorFocusKeys
        project={useVideoEditorStore.getState().project!}
        pixelsPerSecond={100}
        projection={projection}
      />
    )
  );
  expect(host.querySelector('[data-cursor-focus-key="before"]')).toBeNull();
  expect(host.querySelector('[data-cursor-focus-key="after"]')).toBeNull();
  expect(host.querySelector<HTMLElement>('[data-cursor-focus-key="visible"]')!.style.left).toBe(
    '196px'
  );
  vi.spyOn(
    host.querySelector('[data-ui="cursorFocusPath.timelineKeys"]')!,
    'getBoundingClientRect'
  ).mockReturnValue({
    x: 100,
    y: 0,
    left: 100,
    top: 0,
    width: 400,
    height: 24,
    right: 500,
    bottom: 24,
    toJSON: () => ({}),
  });
  const row = host.querySelector<HTMLButtonElement>(
    'button[title="videoEditor.sidebar.cursorFocusRowHint"]'
  )!;
  act(() =>
    row.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        detail: 2,
        clientX: 200,
      })
    )
  );
  const doubleClick = useVideoEditorStore.getState();
  expect(doubleClick.projectHistory.past).toHaveLength(1);
  const first = doubleClick
    .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((key) => key.anchor === 'manual')!;
  expect(first.time).toBe(5);
  expect(doubleClick.selection).toMatchObject({ kind: 'cursor-segment', sampleId: first.id });
  expect(doubleClick.currentTime).toBe(5);
  expect(doubleClick.project!.cursorTrack).toEqual(facts);
  act(() => useVideoEditorStore.getState().undoProject());
  act(() =>
    row.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        clientX: 300,
        clientY: 10,
      })
    )
  );
  const add = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')].find(
    (button) => button.textContent === 'videoEditor.sidebar.cursorFocusAdd'
  )!;
  act(() => add.click());
  const contextAdd = useVideoEditorStore.getState();
  expect(contextAdd.projectHistory.past).toHaveLength(1);
  const second = contextAdd
    .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((key) => key.anchor === 'manual')!;
  expect(second.time).toBe(6);
  expect(contextAdd.selection).toMatchObject({ kind: 'cursor-segment', sampleId: second.id });
  expect(contextAdd.currentTime).toBe(6);
  expect(contextAdd.project!.cursorTrack).toEqual(facts);
});
