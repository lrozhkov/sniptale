// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioRecorderSidebarStepCard } from './step-card';
import type { ScenarioRecorderSidebarStep } from './types';

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('DragEvent', Event);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
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

function createStep(overrides?: Partial<ScenarioRecorderSidebarStep>): ScenarioRecorderSidebarStep {
  return {
    id: 'step-2',
    position: 1,
    previewDataUrl: 'data:image/png;base64,2',
    title: 'Step two',
    ...overrides,
  };
}

function renderStepCard() {
  const onMoveStep = vi.fn();
  const setDragStepId = vi.fn();

  act(() => {
    root?.render(
      <ScenarioRecorderSidebarStepCard
        dragStepId="step-1"
        highlightedStepId="step-2"
        index={0}
        onDeleteStep={vi.fn()}
        onInspectStep={vi.fn()}
        onMoveStep={onMoveStep}
        onPreviewOpen={vi.fn()}
        setDragStepId={setDragStepId}
        step={createStep()}
      />
    );
  });

  return { onMoveStep, setDragStepId };
}

function dispatchDragFlow(card: HTMLElement | null | undefined): void {
  act(() => {
    card?.dispatchEvent(new DragEvent('dragstart', { bubbles: true }));
    card?.dispatchEvent(new DragEvent('drop', { bubbles: true }));
    card?.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
  });
}

describe('ScenarioRecorderSidebarStepCard', () => {
  it('wires drag ownership, drop move, and highlighted class through the thin root facade', () => {
    const { onMoveStep, setDragStepId } = renderStepCard();

    const card = container?.querySelector<HTMLElement>('[data-ui="content.scenario.sidebar.step"]');
    expect(card?.className).toContain('animate-[pulse_1.6s_ease-out_1]');

    dispatchDragFlow(card);

    expect(setDragStepId).toHaveBeenNthCalledWith(1, 'step-2');
    expect(onMoveStep).toHaveBeenCalledWith('step-1', 1);
    expect(setDragStepId).toHaveBeenLastCalledWith(null);
  });
});
