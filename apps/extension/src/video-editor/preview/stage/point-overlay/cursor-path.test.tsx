// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../features/video/project/cursor';
import { deriveProjectCursorFocusPath } from '../../../../features/video/project/cursor-focus-path/projection';
import { authoredCursorFocusPath } from '../../../../features/video/project/cursor-focus-path/authoring';
import { applyVideoProjectMutationPatch } from '../../../../features/video/project/mutation';
import { useVideoEditorStore } from '../../../state/store';
import { PreviewCursorPathOverlay } from './cursor-path';
import type { PointOverlayParams } from './types';

vi.mock('../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function renderCursor() {
  let project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'cursor.webm',
    width: 100,
    height: 100,
    duration: 3,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 1, 2].map((time) => ({
        id: `recorded-${time}`,
        time,
        x: 25 + time * 20,
        y: 25 + time * 20,
        recordingPoint: { x: 0.25 + time * 0.2, y: 0.25 + time * 0.2 },
        visible: true,
        interpolation: 'LINEAR' as const,
        skinOverride: null,
      })),
    },
  });
  const path = deriveProjectCursorFocusPath(project);
  const key = path.segments
    .flatMap((segment) => segment.keys)
    .find((item) => item.id === 'recorded-0')!;
  key.incoming = { x: 0.3, y: 0.45 };
  key.outgoing = { x: 0.6, y: 0.45 };
  project = applyVideoProjectMutationPatch(project, {
    cursorFocusPath: authoredCursorFocusPath(path),
  });
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectCursorSegment('recorded-0');
  const params: PointOverlayParams = {
    project,
    currentTime: 0,
    stageRef: { current: host },
    placementMode: null,
    selectedActionOccurrence: null,
    selectedMotionRegion: null,
    camera: {
      focusPoint: { x: 50, y: 50 },
      scale: 1,
      motionBlurAmount: 0,
      regionId: null,
      viewportWidth: 100,
      viewportHeight: 100,
      viewportX: 0,
      viewportY: 0,
    },
    onClearPlacementMode: vi.fn(),
    onUpdateActionEventDetails: vi.fn(),
    onUpdateMotionRegion: vi.fn(),
  };
  act(() => root.render(<PreviewCursorPathOverlay {...params} />));
  return { project, params, handle: host.querySelector('[data-cursor-focus-key="recorded-0"]')! };
}
function pointer(target: Element | Window, type: string, x = 45, y = 45) {
  act(() => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y })));
}
it.each(['lock', 'replacement', 'path-change'] as const)(
  'a refused cursor drag never selects an uncommitted override (%s)',
  (reason) => {
    const { handle } = renderCursor();
    pointer(
      handle,
      'pointerdown',
      Number(handle.getAttribute('cx')),
      Number(handle.getAttribute('cy'))
    );
    pointer(window, 'pointermove', 70, 70);
    act(() =>
      useVideoEditorStore.getState().updateProject((project) => ({
        ...project,
        ...(reason === 'lock'
          ? {
              utilityLanes: {
                actions: { visible: true, locked: true },
                camera: { visible: true, locked: false },
              },
            }
          : reason === 'replacement'
            ? { id: 'replacement' }
            : {
                cursorFocusPath: { ...project.cursorFocusPath!, smoothing: 0.7 },
              }),
      }))
    );
    const before = useVideoEditorStore.getState();
    pointer(window, 'pointerup');
    const after = useVideoEditorStore.getState();
    expect(after.project).toEqual(before.project);
    expect(after.projectHistory).toEqual(before.projectHistory);
    expect(after.selection).toEqual(before.selection);
  }
);
it('one canvas drag records one override and Undo restores captured facts', () => {
  const { project, handle } = renderCursor();
  const facts = structuredClone(project.cursorTrack);
  pointer(
    handle,
    'pointerdown',
    Number(handle.getAttribute('cx')),
    Number(handle.getAttribute('cy'))
  );
  pointer(window, 'pointermove', 60, 60);
  pointer(window, 'pointermove', 70, 70);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  pointer(window, 'pointerup');
  const edited = useVideoEditorStore.getState();
  expect(edited.project!.cursorTrack).toEqual(facts);
  expect(edited.projectHistory.past).toHaveLength(1);
  expect(edited.selection).toEqual({
    kind: 'cursor-segment',
    sampleId: 'focus-override:recorded-0',
  });
  const manual = edited
    .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((key) => key.id === 'focus-override:recorded-0')!;
  expect(manual.anchor).toBe('manual');
  expect(manual.x).toBeGreaterThan(0.25);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.cursorFocusPath).toEqual(project.cursorFocusPath);
  expect(useVideoEditorStore.getState().project!.cursorTrack).toEqual(facts);
});
it.each(['Escape', 'pointercancel', 'blur'] as const)(
  'canvas cancellation restores the curve (%s)',
  (reason) => {
    const { project, handle } = renderCursor();
    const originalCurve = host.querySelector('polyline')!.getAttribute('points');
    pointer(
      handle,
      'pointerdown',
      Number(handle.getAttribute('cx')),
      Number(handle.getAttribute('cy'))
    );
    pointer(window, 'pointermove', 70, 70);
    expect(host.querySelector('polyline')!.getAttribute('points')).not.toBe(originalCurve);
    if (reason === 'Escape')
      act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: reason })));
    else pointer(window, reason);
    pointer(window, 'pointerup');
    expect(useVideoEditorStore.getState().project!.cursorFocusPath).toEqual(
      project.cursorFocusPath
    );
    expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
    expect(host.querySelector('polyline')!.getAttribute('points')).toBe(originalCurve);
  }
);
it.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])(
  'keyboard nudges preserve facts (%s)',
  (key) => {
    const { project, handle } = renderCursor();
    act(() => handle.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key })));
    const edited = useVideoEditorStore.getState();
    expect(edited.project!.cursorTrack).toEqual(project.cursorTrack);
    expect(edited.projectHistory.past).toHaveLength(1);
    expect(edited.selection).toEqual({
      kind: 'cursor-segment',
      sampleId: 'focus-override:recorded-0',
    });
  }
);
it('neighbor keys navigate and tangent edits leave recorded endpoints unchanged', () => {
  const { project } = renderCursor();
  const selected = host.querySelector('[data-cursor-focus-key="recorded-0"]')!;
  const neighbor = [...host.querySelectorAll('[data-cursor-focus-key]')].find(
    (item) => item !== selected
  )!;
  act(() => neighbor.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
  expect(useVideoEditorStore.getState().selection).toEqual({
    kind: 'cursor-segment',
    sampleId: neighbor.getAttribute('data-cursor-focus-key'),
  });
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
  act(() => useVideoEditorStore.getState().selectCursorSegment('recorded-0'));
  const tangent = host.querySelector('[aria-label="videoEditor.sidebar.cursorFocusOutgoing"]')!;
  act(() =>
    tangent.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowRight' }))
  );
  const key = useVideoEditorStore
    .getState()
    .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((item) => item.id === 'recorded-0')!;
  expect(key).toMatchObject({ x: 0.25, y: 0.25, outgoing: { x: 0.61, y: 0.45 } });
  expect(useVideoEditorStore.getState().project!.cursorTrack).toEqual(project.cursorTrack);
});
