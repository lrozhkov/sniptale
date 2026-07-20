// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../../../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

import { ProjectTimelineClipActions } from './actions';

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

function renderClipActions(selectedClip: boolean) {
  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  const onDeleteSelectedClip = vi.fn();
  const onDuplicateSelectedClip = vi.fn();
  const onSplitSelectedClip = vi.fn();

  act(() => {
    root?.render(
      <ProjectTimelineClipActions
        selectedClip={selectedClip}
        onDeleteSelectedClip={onDeleteSelectedClip}
        onDuplicateSelectedClip={onDuplicateSelectedClip}
        onSplitSelectedClip={onSplitSelectedClip}
      />
    );
  });

  return { onDeleteSelectedClip, onDuplicateSelectedClip, onSplitSelectedClip };
}

it('keeps clip actions disabled until a clip is selected', () => {
  const handlers = renderClipActions(false);

  expect(
    Array.from(container?.querySelectorAll('button') ?? []).every((button) => button.disabled)
  ).toBe(true);

  act(() => {
    container?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.click());
  });

  expect(handlers.onDeleteSelectedClip).not.toHaveBeenCalled();
  expect(handlers.onDuplicateSelectedClip).not.toHaveBeenCalled();
  expect(handlers.onSplitSelectedClip).not.toHaveBeenCalled();
});

it('wires clip action handlers and labels when a clip is selected', () => {
  const handlers = renderClipActions(true);
  const buttons = Array.from(container?.querySelectorAll<HTMLButtonElement>('button') ?? []);

  act(() => {
    buttons.forEach((button) => button.click());
  });

  expect(buttons.map((button) => button.textContent)).toEqual([
    'videoEditor.timeline.split',
    'videoEditor.timeline.duplicate',
    'videoEditor.timeline.delete',
  ]);
  expect(handlers.onSplitSelectedClip).toHaveBeenCalledTimes(1);
  expect(handlers.onDuplicateSelectedClip).toHaveBeenCalledTimes(1);
  expect(handlers.onDeleteSelectedClip).toHaveBeenCalledTimes(1);
});
