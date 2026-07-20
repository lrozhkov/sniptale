// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createScenarioCaptureStep,
  createScenarioNoteStep,
  createScenarioSectionStep,
} from '../../../features/scenario/project/public';
import type { ScenarioStep } from '../../../features/scenario/contracts/types/project';
import { ScenarioNavigatorStepRow } from './ScenarioSlideNavigatorStepRow';

vi.mock('../../../platform/i18n', () => ({
  translate: (key: string) => key,
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function dispatchDrop(element: HTMLElement | null | undefined) {
  element?.dispatchEvent(new Event('drop', { bubbles: true }));
}

function renderStepRow(
  step: ScenarioStep = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' }),
  overrides?: Partial<Parameters<typeof ScenarioNavigatorStepRow>[0]>
) {
  const controller = {
    project: {
      selectedStepId: null,
      setQuickEditStepId: vi.fn(),
      setSelectedStepId: vi.fn(),
    },
    stepActions: {
      deleteStep: vi.fn(),
      moveStepToPosition: vi.fn(),
    },
    ui: {
      setInspectedStepId: vi.fn(),
    },
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(
      <ScenarioNavigatorStepRow
        controller={controller as never}
        dragStepId={null}
        index={1}
        onSetDragStepId={vi.fn()}
        step={step}
        thumbnailUrl={null}
        {...overrides}
      />
    );
  });

  return { controller, step };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('selects the clicked navigator step', () => {
  const { controller, step } = renderStepRow();

  act(() => {
    container?.querySelector<HTMLElement>('[data-ui="scenario.editor.navigator.step"]')?.click();
  });

  expect(controller.project.setSelectedStepId).toHaveBeenCalledWith(step.id);
});

it('selects the navigator step from keyboard interaction', () => {
  const { controller, step } = renderStepRow();

  act(() => {
    container
      ?.querySelector<HTMLElement>('[data-ui="scenario.editor.navigator.step"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(controller.project.setSelectedStepId).toHaveBeenCalledWith(step.id);
});

it('opens metadata inspection for capture steps without bubbling to a different selection target', () => {
  const { controller, step } = renderStepRow();

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.content.viewMetadata"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(controller.project.setSelectedStepId).not.toHaveBeenCalled();
  expect(controller.ui.setInspectedStepId).toHaveBeenCalledWith(step.id);
  expect(controller.stepActions.deleteStep).not.toHaveBeenCalled();
});

it('deletes the intended step without selecting a different row', () => {
  const step = createScenarioNoteStep({ title: 'Note row' });
  const { controller } = renderStepRow(step);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.deleteStep"]')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  expect(controller.stepActions.deleteStep).toHaveBeenCalledWith(step.id);
  expect(controller.project.setSelectedStepId).not.toHaveBeenCalled();
});

it('ignores nested action-button keyboard events when resolving row selection', () => {
  const step = createScenarioNoteStep({ title: 'Note row' });
  const { controller } = renderStepRow(step);

  act(() => {
    container
      ?.querySelector<HTMLButtonElement>('[aria-label="scenario.editor.deleteStep"]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
  });

  expect(controller.project.setSelectedStepId).not.toHaveBeenCalled();
});

it('moves a dragged step to the current position and clears drag state', () => {
  const onSetDragStepId = vi.fn();
  const { controller, step } = renderStepRow(undefined, {
    dragStepId: 'dragged-step',
    onSetDragStepId,
  });

  act(() => {
    dispatchDrop(
      container?.querySelector<HTMLElement>('[data-ui="scenario.editor.navigator.step"]')
    );
  });

  expect(controller.stepActions.moveStepToPosition).toHaveBeenCalledWith('dragged-step', 1);
  expect(onSetDragStepId).toHaveBeenCalledWith(null);
  expect(step.id).toBeTruthy();
});

it('marks selected rows and ignores self-drop moves', () => {
  const step = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture' });
  renderStepRow(step, {
    controller: {
      project: {
        selectedStepId: step.id,
        setQuickEditStepId: vi.fn(),
        setSelectedStepId: vi.fn(),
      },
      stepActions: {
        deleteStep: vi.fn(),
        moveStepToPosition: vi.fn(),
      },
      ui: {
        setInspectedStepId: vi.fn(),
      },
    } as never,
    dragStepId: step.id,
  });

  const row = container?.querySelector<HTMLElement>('[data-ui="scenario.editor.navigator.step"]');
  act(() => {
    dispatchDrop(row);
  });

  expect(row?.dataset['selected']).toBe('true');
});

it('shows capture thumbnails without requiring hover', () => {
  renderStepRow(undefined, {
    thumbnailUrl: 'data:image/png;base64,thumb',
  });

  expect(container?.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,thumb');
});

it('hides legacy section body copy from navigator previews', () => {
  renderStepRow(
    createScenarioSectionStep({
      title: 'Heading',
      body: 'Hidden caption',
    })
  );

  expect(container?.textContent).toContain('Heading');
  expect(container?.textContent).not.toContain('Hidden caption');
});
