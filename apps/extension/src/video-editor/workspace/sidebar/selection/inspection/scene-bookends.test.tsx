// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createVideoProjectFromRecording } from '../../../../../features/video/project/factories/creation';
import { useVideoEditorStore } from '../../../../state/store';
import { SceneBookendFields } from './scene-bookends';

vi.mock('../../../../../platform/i18n', async (original) => ({
  ...(await original<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let initial: ReturnType<typeof useVideoEditorStore.getState>;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  initial = useVideoEditorStore.getState();
  useVideoEditorStore.getState().setProject(
    createVideoProjectFromRecording({
      recordingId: 'recording',
      filename: 'Source.webm',
      width: 640,
      height: 360,
      duration: 6,
      size: 100,
      mimeType: 'video/webm',
    })
  );
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
function render(side: 'intro' | 'outro' = 'intro') {
  act(() =>
    root.render(
      <SceneBookendFields project={useVideoEditorStore.getState().project!} side={side} />
    )
  );
}
function trigger() {
  return host.querySelector<HTMLButtonElement>('button')!;
}
function items() {
  return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
}
function key(target: Element, value: string) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
    )
  );
}

it.each(['intro', 'outro'] as const)(
  'inserts an ordinary selected %s clip through the real port and one history step',
  (side) => {
    render(side);
    const before = useVideoEditorStore.getState().project!;
    act(() => trigger().click());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);
    act(() => items()[0]!.click());
    const state = useVideoEditorStore.getState();
    expect(state.project!.clips).toHaveLength(2);
    expect(state.project!.clips[0]!.startTime).toBe(side === 'intro' ? 6 : 0);
    expect(state.project!.clips[1]!.startTime).toBe(side === 'intro' ? 0 : 6);
    expect(state.selection).toEqual({ kind: 'clip', clipId: state.project!.clips[1]!.id });
    expect(state.projectHistory.past).toHaveLength(1);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(before.clips[0]!.startTime).toBe(0);
  }
);

it('opens at the requested end, navigates command rows, and cancels without editing', () => {
  const project = useVideoEditorStore.getState().project!;
  project.assets.push({ ...project.assets[0]!, id: 'second', name: 'Another source' });
  render();
  key(trigger(), 'ArrowUp');
  expect(document.activeElement).toBe(items()[1]);
  key(items()[1]!, 'Home');
  expect(document.activeElement).toBe(items()[0]);
  key(items()[0]!, 'ArrowDown');
  expect(document.activeElement).toBe(items()[1]);
  key(items()[1]!, 'Escape');
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
  expect(useVideoEditorStore.getState().project).toBe(project);
  expect(useVideoEditorStore.getState().projectHistory.past).toHaveLength(0);
});

it('dismisses outside without taking focus from the chosen destination', () => {
  render();
  act(() => trigger().click());
  const outside = document.createElement('button');
  document.body.append(outside);
  act(() => {
    outside.focus();
    outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  expect(document.activeElement).toBe(outside);
  expect(document.querySelector('[role="menu"]')).toBeNull();
  outside.remove();
});

it('refuses a stale snapshot and allows retry after the inspector receives the accepted project', () => {
  render();
  act(() => useVideoEditorStore.getState().renameProject('Other edit'));
  const accepted = useVideoEditorStore.getState().project!;
  act(() => trigger().click());
  act(() => items()[0]!.click());
  expect(host.querySelector('[role="alert"]')!.textContent).toBe(
    'videoEditor.sidebar.bookendStale'
  );
  expect(useVideoEditorStore.getState().project).toBe(accepted);
  render();
  act(() => trigger().click());
  act(() => items()[0]!.click());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it('retains a foreign lease and offers retry after the current edit ends', () => {
  render();
  const lease = useVideoEditorStore
    .getState()
    .beginProjectHistoryTransaction({ onlyIfIdle: true })!;
  act(() => trigger().click());
  act(() => items()[0]!.click());
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('videoEditor.sidebar.bookendBusy');
  expect(useVideoEditorStore.getState().projectHistory.transaction!.lease).toBe(lease);
  act(() => useVideoEditorStore.getState().endProjectHistoryTransaction(lease));
  act(() => trigger().click());
  act(() => items()[0]!.click());
  expect(useVideoEditorStore.getState().project!.clips).toHaveLength(2);
});

it('keeps the command disabled without visual materials and closes a replaced project menu', () => {
  const project = useVideoEditorStore.getState().project!;
  project.assets[0]!.type = 'AUDIO';
  render();
  expect(trigger().disabled).toBe(true);
  expect(trigger().title).toBe('videoEditor.sidebar.bookendNoMaterials');
  project.assets[0]!.type = 'VIDEO';
  render();
  act(() => trigger().click());
  expect(document.querySelector('[role="menu"]')).not.toBeNull();
  act(() => useVideoEditorStore.getState().setProject(structuredClone(project)));
  render();
  expect(document.querySelector('[role="menu"]')).toBeNull();
  expect(trigger().getAttribute('aria-expanded')).toBe('false');
});
