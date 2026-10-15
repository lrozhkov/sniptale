// @vitest-environment jsdom
import { authoredCursorFocusPath } from '../../../../../features/video/project/cursor-focus-path/authoring';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useVideoEditorStore } from '../../../../state/store';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { normalizeVideoProjectCursorSkin } from '../../../../../features/video/project/cursor';
import { deriveProjectCursorFocusPath } from '../../../../../features/video/project/cursor-focus-path/projection';
import { applyVideoProjectMutationPatch } from '../../../../../features/video/project/mutation';
import { InspectCursorPath, InspectCursorPathSettings } from './cursor-path';
vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  getCurrentLocale: () => 'en',
  useAppLocale: () => 'en',
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  useVideoEditorStore.setState(initial, true);
  vi.unstubAllGlobals();
});
it.each([true, false])('locked cursor history refuses Add (rendered lock: %s)', (renderedLock) => {
  const project = createVideoProjectFromRecording({
    recordingId: 'locked-recording',
    filename: 'locked.webm',
    width: 100,
    height: 100,
    duration: 2,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [{ id: 'recorded', time: 0, x: 25, y: 25, visible: true }],
    },
  });
  project.utilityLanes = {
    actions: { visible: true, locked: renderedLock },
    camera: { visible: true, locked: false },
  };
  useVideoEditorStore.getState().setProject(project);
  useVideoEditorStore.getState().selectCursorSegment('recorded');
  act(() => root.render(<InspectCursorPath project={project} sampleId="recorded" time={0} />));
  if (!renderedLock) {
    act(() =>
      useVideoEditorStore.getState().updateProject((current) => ({
        ...current,
        utilityLanes: {
          actions: { visible: true, locked: true },
          camera: { visible: true, locked: false },
        },
      }))
    );
  }
  const before = useVideoEditorStore.getState();
  const add = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'videoEditor.sidebar.cursorFocusAdd'
  )!;
  act(() => add.click());
  const after = useVideoEditorStore.getState();
  expect(after.project).toEqual(before.project);
  expect(after.projectHistory).toEqual(before.projectHistory);
  expect(after.selection).toEqual(before.selection);
  expect(after.currentTime).toEqual(before.currentTime);
  expect(add.disabled).toBe(renderedLock);
  if (renderedLock)
    for (const input of host.querySelectorAll('input')) expect(input.disabled).toBe(true);
});
it('standalone inspector adds an authored key in one undo step and reset keeps source facts', async () => {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'cursor.webm',
    width: 100,
    height: 100,
    duration: 2,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [
        {
          id: 'recorded',
          time: 0,
          x: 25,
          y: 25,
          visible: true,
          recordingPoint: { x: 0.25, y: 0.25 },
        },
      ],
    },
  });

  const authored = applyVideoProjectMutationPatch(project, {
    cursorFocusPath: authoredCursorFocusPath(deriveProjectCursorFocusPath(project)),
  });
  useVideoEditorStore.getState().setProject(authored);
  const facts = structuredClone(useVideoEditorStore.getState().project!.cursorTrack);

  act(() => root.render(<InspectCursorPath project={authored} sampleId="recorded" time={0} />));
  const add = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'videoEditor.sidebar.cursorFocusAdd'
  )!;
  act(() => add.click());
  const edited = useVideoEditorStore.getState().project!;
  expect(edited.cursorFocusPath!.segments[0]!.keys).toHaveLength(1);
  expect(edited.cursorTrack).toEqual(facts);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(1);
  expect(useVideoEditorStore.getState().selection.kind).toBe('cursor-segment');
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.cursorFocusPath).toEqual(authored.cursorFocusPath);
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.cursorFocusPath!.segments[0]!.keys).toHaveLength(
    1
  );
  // Reopening selects a recorded history point; retained manual keys must remain selectable.
  const reopened = structuredClone(useVideoEditorStore.getState().project!);
  act(() => {
    useVideoEditorStore.getState().setProject(reopened);
    useVideoEditorStore.getState().selectCursorSegment('recorded');
    root.render(<InspectCursorPath project={reopened} sampleId="recorded" time={0} />);
  });
  const keyPicker = host.querySelector<HTMLButtonElement>(
    '[aria-label="videoEditor.sidebar.cursorFocusKey"]'
  );
  expect(keyPicker).not.toBeNull();
  act(() => keyPicker!.click());
  const manualOption = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
    (option) => option.textContent?.includes('videoEditor.sidebar.cursorFocusManualKey')
  )!;
  expect(manualOption).toBeDefined();
  await act(async () => manualOption.click());
  expect(useVideoEditorStore.getState().selection).toMatchObject({
    kind: 'cursor-segment',
    sampleId: reopened.cursorFocusPath!.segments[0]!.keys[0]!.id,
  });
  act(() =>
    root.render(<InspectCursorPathSettings project={useVideoEditorStore.getState().project!} />)
  );
  const reset = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'videoEditor.sidebar.cursorFocusReset'
  )!;
  act(() => reset.click());
  expect(useVideoEditorStore.getState().project!.cursorFocusPath).toBeUndefined();
  expect(useVideoEditorStore.getState().project!.cursorTrack).toEqual(facts);
});
function editableInspector() {
  const project = createVideoProjectFromRecording({
    recordingId: 'editable',
    filename: 'editable.webm',
    width: 100,
    height: 100,
    duration: 2,
    mimeType: 'video/webm',
    size: 100,
    cursorTrack: {
      captureMode: 'embedded-fallback',
      skin: normalizeVideoProjectCursorSkin(undefined),
      samples: [0, 1].map((time) => ({
        id: `fact-${time}`,
        time,
        x: 25 + time * 40,
        y: 25 + time * 40,
        visible: true,
        interpolation: 'LINEAR' as const,
        skinOverride: null,
        recordingPoint: { x: 0.25 + time * 0.4, y: 0.25 + time * 0.4 },
      })),
    },
  });
  useVideoEditorStore.getState().setProject(project);
  const render = (id = 'fact-0', time = 0) =>
    act(() =>
      root.render(
        <InspectCursorPath
          project={useVideoEditorStore.getState().project!}
          sampleId={id}
          time={time}
        />
      )
    );
  render();
  return { project, render };
}
function inspectorNumber(label: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  expect(input).not.toBeNull();
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })));
}
it('numeric source-point edits retain raw geometry and select the accepted manual override', () => {
  const { project, render } = editableInspector();
  inspectorNumber('X', '0.6');
  const edited = useVideoEditorStore.getState();
  expect(edited.selection).toEqual({ kind: 'cursor-segment', sampleId: 'focus-override:fact-0' });
  expect(edited.project!.cursorTrack).toEqual(project.cursorTrack);
  expect(edited.projectHistory.past).toHaveLength(1);
  render('focus-override:fact-0');
  inspectorNumber('Y', '0.7');
  render('focus-override:fact-0');
  inspectorNumber('videoEditor.sidebar.actionTimePrefix', '0.5');
  const key = useVideoEditorStore
    .getState()
    .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((item) => item.id === 'focus-override:fact-0')!;
  expect(key).toMatchObject({ x: 0.6, y: 0.7, time: 0.5 });
  act(() =>
    root.render(
      <InspectCursorPath
        project={useVideoEditorStore.getState().project!}
        sampleId={key.id}
        time={0.5}
      />
    )
  );
  const remove = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === 'common.actions.delete'
  )!;
  act(() => remove.click());
  expect(
    useVideoEditorStore
      .getState()
      .project!.cursorFocusPath!.segments.flatMap((segment) => segment.keys)
  ).not.toContainEqual(expect.objectContaining({ id: key.id }));
  expect(useVideoEditorStore.getState().project!.cursorTrack).toEqual(project.cursorTrack);
});
it('fine tangent tuning retains source endpoints and global policy tuning stays in Scene', () => {
  const { project, render } = editableInspector();
  inspectorNumber('videoEditor.sidebar.cursorFocusIncoming X', '-0.3');
  render();
  inspectorNumber('videoEditor.sidebar.cursorFocusOutgoing Y', '0.8');
  const edited = useVideoEditorStore.getState().project!;
  const key = edited
    .cursorFocusPath!.segments.flatMap((segment) => segment.keys)
    .find((item) => item.id === 'fact-0')!;
  expect(key).toMatchObject({ x: 0.25, y: 0.25, incoming: { x: -0.3 }, outgoing: { y: 0.8 } });
  act(() => root.render(<InspectCursorPathSettings project={edited} />));
  inspectorNumber('videoEditor.sidebar.cursorFocusSmoothing', '0.8');
  act(() =>
    root.render(<InspectCursorPathSettings project={useVideoEditorStore.getState().project!} />)
  );
  inspectorNumber('videoEditor.sidebar.cameraZoneSize', '80');
  expect(useVideoEditorStore.getState().project!.cursorFocusPath).toMatchObject({
    smoothing: 0.8,
    sensitivity: project.cursorFocusPath?.sensitivity ?? 0.5,
  });
  const policyProject = useVideoEditorStore.getState().project!;
  expect(policyProject.cameraFollowDefaults).toMatchObject({
    zoneSize: 0.8,
    transitionDuration: 0.65,
  });
  expect(policyProject.version).toBe(4);
  expect(policyProject.cursorTrack).toEqual(project.cursorTrack);
  act(() => useVideoEditorStore.getState().undoProject());
  expect(useVideoEditorStore.getState().project!.cameraFollowDefaults).toBeUndefined();
  act(() => useVideoEditorStore.getState().redoProject());
  expect(useVideoEditorStore.getState().project!.cameraFollowDefaults).toEqual(
    policyProject.cameraFollowDefaults
  );
  act(() => useVideoEditorStore.getState().setProject(structuredClone(policyProject)));
  expect(useVideoEditorStore.getState().project!.cameraFollowDefaults).toEqual(
    policyProject.cameraFollowDefaults
  );
});

it.each([true, false])(
  'keeps path and camera locks independent inside one disclosure (camera locked: %s)',
  (cameraLocked) => {
    const { project } = editableInspector();
    project.utilityLanes = {
      actions: { visible: true, locked: !cameraLocked },
      camera: { visible: true, locked: cameraLocked },
    };
    useVideoEditorStore.getState().setProject(project);
    act(() => root.render(<InspectCursorPathSettings project={project} />));
    const smoothing = host.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.cursorFocusSmoothing"]'
    )!;
    const duration = host.querySelector<HTMLInputElement>(
      'input[aria-label="videoEditor.sidebar.cameraTransitionDuration"]'
    )!;
    expect(smoothing.matches(':disabled')).toBe(!cameraLocked);
    expect(duration.matches(':disabled')).toBe(cameraLocked);
  }
);
