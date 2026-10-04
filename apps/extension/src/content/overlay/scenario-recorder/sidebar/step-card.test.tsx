// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
    position: 3,
    numberLabel: '2',
    previewDataUrl: 'data:image/png;base64,2',
    title: 'Step two',
    ...overrides,
  };
}

function renderStepCard() {
  const onMoveStep = vi.fn();

  act(() => {
    root?.render(
      <ScenarioRecorderSidebarStepCard
        highlightedStepId="step-2"
        moveUpIndex={5}
        moveDownIndex={null}
        onDeleteStep={vi.fn()}
        onInspectStep={vi.fn()}
        onMoveStep={onMoveStep}
        onPreviewOpen={vi.fn()}
        step={createStep()}
      />
    );
  });

  return { onMoveStep };
}

it('moves by a canonical neighbor index and disables the unavailable direction', () => {
  const { onMoveStep } = renderStepCard();
  const card = container?.querySelector<HTMLElement>('[data-ui="content.scenario.sidebar.step"]');
  expect(card?.draggable).toBe(false);
  expect(card?.className).toContain('animate-[pulse_1.6s_ease-out_1]');
  const up = card?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-move-up"]'
  );
  const down = card?.querySelector<HTMLButtonElement>(
    '[data-ui="content.scenario.sidebar.step-move-down"]'
  );
  expect(up?.disabled).toBe(false);
  expect(down?.disabled).toBe(true);
  act(() => {
    up?.click();
    down?.click();
  });
  expect(onMoveStep).toHaveBeenCalledExactlyOnceWith('step-2', 5);
  expect(up?.parentElement?.className).toContain('group-focus-within');
});
