// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { KeyFeedbackFields } from './key-feedback-fields';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import {
  patchReviewKeys,
  type ReviewKeyPatch,
} from '../../../../../features/video/project/action-feedback/key-animation';
import type { VideoProject } from '../../../../../features/video/project/types';
import { getVideoProjectUtilityLanes } from '../../../../../features/video/project/utility-lanes';

const { updateProject, callbacks } = vi.hoisted(() => ({
  updateProject: vi.fn<(update: (project: VideoProject) => VideoProject) => void>(),
  callbacks: [] as ((patch: ReviewKeyPatch) => void)[],
}));
vi.mock('../../../../runtime/controller/store', () => ({
  useVideoEditorTimelineEditingPort: (
    selector: (port: { updateProject: typeof updateProject }) => unknown
  ) => selector({ updateProject }),
}));
vi.mock('../../../../../ui/keyboard-feedback/fields', () => ({
  KeyboardFeedbackFields: (props: { onChange(patch: ReviewKeyPatch): void }) => {
    callbacks.push(props.onChange);
    return <div data-ui="controlled-key-fields" />;
  },
}));
vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  updateProject.mockClear();
  callbacks.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
function fixture() {
  const project = createVideoProjectFromRecording({
    recordingId: 'recording',
    filename: 'source.webm',
    width: 160,
    height: 90,
    duration: 5,
    mimeType: 'video/webm',
    size: 100,
    sourceNormalizedActionEvents: [
      {
        id: 'key',
        kind: 'KEY',
        time: 1,
        duration: 0.2,
        point: null,
        label: 'Ctrl+K',
        preset: 'NONE',
        data: {},
      },
    ],
  });
  const group = project.actionFeedback![0]!;
  group.keyStyles = patchReviewKeys([], ['key'], { enabled: true, style: { fontSize: 32 } });
  project.actionFeedback!.push({ ...structuredClone(group), sourceInstanceId: 'other' });
  const mount = (disabled = false) =>
    act(() =>
      root.render(
        <KeyFeedbackFields
          project={project}
          recordingId={group.recordingId}
          sourceInstanceId={group.sourceInstanceId}
          sourceEventId="key"
          part="display"
          disabled={disabled}
        />
      )
    );
  return { project, mount };
}
function execute(current: VideoProject) {
  const updater = updateProject.mock.calls.at(-1)?.[0];
  if (!updater) throw new Error('Expected a current-project updater.');
  return updater(current);
}
it('merges a delayed field callback into the current key style and preserves other instances', () => {
  const { project, mount } = fixture();
  mount();
  const change = callbacks.at(-1)!;
  const current = structuredClone(project);
  current.name = 'Concurrent title';
  current.actionFeedback![0]!.keyStyles![0]!.style.color = '#12345680';
  current.actionFeedback![0]!.keyStyles![0]!.after = 3;
  const before = structuredClone(current);
  change({ style: { fontSize: 48 } });
  const next = execute(current);
  expect(next.actionFeedback![0]!.keyStyles![0]).toMatchObject({
    after: 3,
    style: { color: '#12345680', fontSize: 48 },
  });
  expect(next.actionFeedback![1]).toEqual(before.actionFeedback![1]);
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(next.name).toBe('Concurrent title');
  expect(current).toEqual(before);
});
it('refuses a stale key callback after event or feedback group removal', () => {
  const { project, mount } = fixture();
  mount();
  const change = callbacks.at(-1)!;
  for (const current of [
    { ...project, actionEvents: [] },
    { ...project, actionFeedback: [] },
  ]) {
    updateProject.mockClear();
    change({ enabled: true });
    expect(execute(current)).toBe(current);
  }
});
it('returns the current project when key reset is retried after success', () => {
  const { project, mount } = fixture();
  mount();
  const reset = host.querySelector<HTMLButtonElement>('[data-ui="video-editor.key.reset"]')!;
  act(() => reset.click());
  const once = execute(project);
  expect(once.actionFeedback![0]!.keyStyles).toEqual([]);
  expect(once.actionFeedback![1]).toEqual(project.actionFeedback![1]);
  act(() => reset.click());
  expect(execute(once)).toBe(once);
});
it('refuses both a disabled field and a newly locked current project', () => {
  const { project, mount } = fixture();
  mount(true);
  callbacks.at(-1)!({ enabled: false });
  expect(updateProject).not.toHaveBeenCalled();
  mount(false);
  const locked = {
    ...project,
    utilityLanes: {
      ...getVideoProjectUtilityLanes(project),
      actions: { ...getVideoProjectUtilityLanes(project).actions, locked: true },
    },
  };
  callbacks.at(-1)!({ enabled: false });
  expect(execute(locked)).toBe(locked);
});

it('applies a project scope patch to current captured keys and preserves per-key differences', () => {
  const { project } = fixture();
  const event = project.actionEvents[0]!;
  if (event.anchor.kind !== 'recording-source') throw new Error('Missing source anchor.');
  project.actionEvents.push({
    ...event,
    id: 'other-key',
    anchor: { ...event.anchor, sourceInstanceId: 'other' },
  });
  act(() =>
    root.render(
      <KeyFeedbackFields project={project} scope="project" part="display" disabled={false} />
    )
  );
  const change = callbacks.at(-1)!;
  const current = structuredClone(project);
  current.actionFeedback![0]!.keyStyles![0]!.after = 3;
  current.actionFeedback![0]!.keyStyles![0]!.style.color = '#12345680';
  current.actionFeedback![1]!.keyStyles![0]!.before = 0.4;
  current.actionFeedback![1]!.keyStyles![0]!.style.color = '#abcdef90';
  current.actionFeedback!.push({
    ...structuredClone(current.actionFeedback![0]!),
    sourceInstanceId: 'late',
  });
  current.actionEvents.push({
    ...event,
    id: 'late-key',
    anchor: { ...event.anchor, sourceInstanceId: 'late' },
  });
  current.actionEvents.push({ ...event, id: 'manual', anchor: { kind: 'project', time: 2 } });
  const before = structuredClone(current);
  change({ style: { fontSize: 48 } });
  const next = execute(current);
  expect(next.actionFeedback![0]!.keyStyles![0]).toMatchObject({
    after: 3,
    style: { color: '#12345680', fontSize: 48 },
  });
  expect(next.actionFeedback![1]!.keyStyles![0]).toMatchObject({
    before: 0.4,
    style: { color: '#abcdef90', fontSize: 48 },
  });
  expect(next.actionFeedback![2]!.keyStyles![0]!.style.fontSize).toBe(48);
  expect(next.actionEvents).toEqual(before.actionEvents);
  expect(current).toEqual(before);
});
it('refuses missing project scope targets and retries a project reset without another update', () => {
  const { project } = fixture();
  act(() =>
    root.render(
      <KeyFeedbackFields project={project} scope="project" part="display" disabled={false} />
    )
  );
  const change = callbacks.at(-1)!;
  const removed = { ...project, actionEvents: [] };
  change({ enabled: true });
  expect(execute(removed)).toBe(removed);
  const noGroup = { ...project, actionFeedback: [] };
  expect(execute(noGroup)).toBe(noGroup);
  const reset = host.querySelector<HTMLButtonElement>('[data-ui="video-editor.key.reset"]')!;
  act(() => reset.click());
  const once = execute(project);
  expect(once.actionFeedback![0]!.keyStyles).toEqual([]);
  expect(once.actionFeedback![1]).toEqual(project.actionFeedback![1]);
  act(() => reset.click());
  expect(execute(once)).toBe(once);
});
