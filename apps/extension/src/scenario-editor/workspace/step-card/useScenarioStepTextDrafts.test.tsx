// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioSectionStep } from '../../../features/scenario/project/public';
import { useScenarioStepTextDrafts } from './useScenarioStepTextDrafts';

function StepTextDraftHarness(props: {
  onCommitPatch: (patch: object) => void;
  step: ReturnType<typeof createScenarioSectionStep>;
}) {
  const drafts = useScenarioStepTextDrafts(props);

  return (
    <div>
      <button type="button" data-testid="title" onClick={() => drafts.updateTitle('Updated title')}>
        title
      </button>
      <button type="button" data-testid="body" onClick={() => drafts.updateBody('Updated body')}>
        body
      </button>
      <button type="button" data-testid="commit" onClick={drafts.commitDraft}>
        commit
      </button>
      <span data-testid="draft-title">{drafts.title}</span>
      <span data-testid="draft-body">{drafts.body}</span>
    </div>
  );
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let latestStep: ReturnType<typeof createScenarioSectionStep> | null = null;

function renderHarness(
  onCommitPatch = vi.fn(),
  step = createScenarioSectionStep({
    body: 'Original body',
    title: 'Original title',
  })
) {
  latestStep = step;

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<StepTextDraftHarness onCommitPatch={onCommitPatch} step={step} />);
  });

  return { onCommitPatch, step };
}

function rerenderHarness(onCommitPatch = vi.fn(), step = latestStep) {
  if (!step) {
    throw new Error('Expected latest step fixture');
  }

  act(() => {
    root?.render(<StepTextDraftHarness onCommitPatch={onCommitPatch} step={step} />);
  });

  return { onCommitPatch, step };
}

function click(testId: string) {
  act(() => {
    container?.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`)?.click();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  latestStep = null;
  container?.remove();
  container = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('flushes a pending draft when the hook unmounts before debounce completes', () => {
  vi.useFakeTimers();
  const { onCommitPatch } = renderHarness();

  click('title');

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(onCommitPatch).toHaveBeenCalledWith({ title: 'Updated title' });
  expect(onCommitPatch).toHaveBeenCalledTimes(1);
});

it('does not emit a patch when cleanup runs without any draft changes', () => {
  const { onCommitPatch } = renderHarness();

  act(() => {
    root?.unmount();
  });
  root = null;

  expect(onCommitPatch).not.toHaveBeenCalled();
});

it('does not flush a pending draft during a parent rerender with a new commit callback', () => {
  vi.useFakeTimers();
  const initialCommitPatch = vi.fn();
  const rerenderCommitPatch = vi.fn();

  renderHarness(initialCommitPatch);
  click('title');
  rerenderHarness(rerenderCommitPatch);

  expect(initialCommitPatch).not.toHaveBeenCalled();
  expect(rerenderCommitPatch).not.toHaveBeenCalled();

  act(() => {
    vi.advanceTimersByTime(700);
  });

  expect(initialCommitPatch).not.toHaveBeenCalled();
  expect(rerenderCommitPatch).toHaveBeenCalledWith({ title: 'Updated title' });
  expect(rerenderCommitPatch).toHaveBeenCalledTimes(1);
});

it('keeps the local draft intact when a mirrored autosave update rerenders the same text', () => {
  const { onCommitPatch, step } = renderHarness();

  click('title');
  expect(container?.querySelector('[data-testid="draft-title"]')?.textContent).toBe(
    'Updated title'
  );

  rerenderHarness(onCommitPatch, {
    ...step,
    title: 'Updated title',
    updatedAt: step.updatedAt + 1,
  });

  expect(container?.querySelector('[data-testid="draft-title"]')?.textContent).toBe(
    'Updated title'
  );
});
