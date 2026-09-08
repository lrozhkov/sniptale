// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../../../../../features/video/project/factories/creation';
import { InspectHistoryLanePanel } from './history-lane';
import { createFloatingWorkspaceController } from '../../../floating/top-panels.test-support';
import { getWorkspaceSidebarProps } from '../../../surface/sidebar-props';
import { createVideoEditorProjectTestStore } from '../../../../project/state/test-store.test-support';
import { WorkspaceSidebarSelectionBody } from './body';

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
  useAppLocale: () => 'en',
}));

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

it('keeps creation actions out of the history inspector', () => {
  act(() =>
    root.render(
      <InspectHistoryLanePanel
        project={createEmptyVideoProject()}
        onUpdateActionPresentation={vi.fn()}
      />
    )
  );
  expect(
    container.querySelector('button[aria-label="videoEditor.timeline.historyAddClick"]')
  ).toBeNull();
});

it('edits visualization defaults even when history is empty', () => {
  const project = createEmptyVideoProject('Empty history');
  const onUpdateActionPresentation = vi.fn();
  act(() =>
    root.render(
      <InspectHistoryLanePanel
        project={project}
        onUpdateActionPresentation={onUpdateActionPresentation}
      />
    )
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.sidebar.historyEnabled"]'
  );
  expect(toggle?.getAttribute('aria-pressed')).toBe('true');
  act(() => toggle?.click());
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ enabled: false });
  expect(project.actionEvents).toEqual([]);
});

it('locks project presentation controls without hiding their values', () => {
  const project = createEmptyVideoProject('Locked history');
  project.utilityLanes = {
    actions: { visible: true, locked: true },
    camera: { visible: true, locked: false },
  };
  const onUpdateActionPresentation = vi.fn();
  act(() =>
    root.render(
      <InspectHistoryLanePanel
        project={project}
        onUpdateActionPresentation={onUpdateActionPresentation}
      />
    )
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.sidebar.historyEnabled"]'
  );
  expect(toggle?.disabled).toBe(true);
  act(() => toggle?.click());
  expect(onUpdateActionPresentation).not.toHaveBeenCalled();
  act(() =>
    container
      .querySelector<HTMLButtonElement>(
        'nav button[aria-label="videoEditor.sidebar.inspectorGroupAnimation"]'
      )!
      .click()
  );
  expect(container.textContent).toContain('videoEditor.sidebar.historyDuration');
  expect(container.querySelector<HTMLInputElement>('input')?.disabled).toBe(true);
});

it('applies history defaults through the workspace inspector to the real project store', () => {
  const store = createVideoEditorProjectTestStore();
  store.getState().setProject(createEmptyVideoProject('History settings'));
  const controller = createFloatingWorkspaceController().sidebar;
  controller.projectActions.onUpdateActionPresentation = store.getState().updateActionPresentation;
  const project = store.getState().project!;
  act(() =>
    root.render(
      <WorkspaceSidebarSelectionBody
        {...getWorkspaceSidebarProps(controller)}
        project={project}
        selection={{ kind: 'history-lane' }}
      />
    )
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.sidebar.historyEnabled"]'
  );
  expect(toggle?.disabled).toBe(false);
  act(() => toggle?.click());
  expect(store.getState().project?.actionPresentation?.enabled).toBe(false);
  expect(store.getState().project?.actionEvents).toEqual(project.actionEvents);
});

it('keeps unavailable history editing disabled through the composed inspector', () => {
  const { onUpdateActionPresentation: _update, ...props } = getWorkspaceSidebarProps(
    createFloatingWorkspaceController().sidebar
  );
  act(() =>
    root.render(
      <WorkspaceSidebarSelectionBody
        {...props}
        project={createEmptyVideoProject('Read-only history')}
        selection={{ kind: 'history-lane' }}
      />
    )
  );
  const toggle = container.querySelector<HTMLButtonElement>(
    'button[aria-label="videoEditor.sidebar.historyEnabled"]'
  );
  expect(toggle?.disabled).toBe(true);
});

it('changes the preset, timing and behavior defaults through the shared controls', async () => {
  const project = createEmptyVideoProject('History controls');
  const onUpdateActionPresentation = vi.fn();
  act(() =>
    root.render(
      <InspectHistoryLanePanel
        project={project}
        onUpdateActionPresentation={onUpdateActionPresentation}
      />
    )
  );
  const click = async (selector: string) => {
    const target = document.body.querySelector<HTMLButtonElement>(selector);
    expect(target).not.toBeNull();
    await act(async () => target!.click());
  };
  const number = (label: string, value: string) => {
    const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
    expect(input).not.toBeNull();
    act(() => {
      input!.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  };
  await click('button[aria-label="videoEditor.sidebar.actionPresetLabel"]');
  await click('[role="option"]');
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ clickPreset: 'NONE' });
  await click('nav button[aria-label="videoEditor.sidebar.inspectorGroupAnimation"]');
  number('videoEditor.sidebar.historyDuration', '1.25');
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ duration: 1.25 });
  number('videoEditor.sidebar.historyOffset', '-0.3');
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ offset: expect.closeTo(-0.3, 12) });
  await click('nav button[aria-label="videoEditor.sidebar.inspectorGroupHistory"]');
  number('videoEditor.sidebar.historySuppression', '0.75');
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ clickSuppressionInterval: 0.75 });
  await click('button[aria-label="videoEditor.sidebar.historyShowKeys"]');
  expect(onUpdateActionPresentation).toHaveBeenCalledWith({ showKeystrokes: true });
});
