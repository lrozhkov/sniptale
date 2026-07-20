// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../features/scenario/project/public';
import { ScenarioEditorWorkspace } from './ScenarioEditorWorkspace';

const mocks = vi.hoisted(() => ({
  viewportSpy: vi.fn(),
  virtualizationSpy: vi.fn(),
}));

vi.mock('./items', () => ({
  ScenarioEditorWorkspaceViewport: (props: object) => {
    mocks.viewportSpy(props);
    return <div data-testid="workspace-viewport">viewport</div>;
  },
}));

vi.mock('./useScenarioWorkspaceVirtualization', () => ({
  useScenarioWorkspaceVirtualization: (...args: unknown[]) => mocks.virtualizationSpy(...args),
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function createVirtualization(selectedStepId: string) {
  const scrollTo = vi.fn();
  return {
    bindMeasuredHeight: vi.fn(() => vi.fn()),
    scrollContainerNodeRef: { current: { clientHeight: 200, scrollTo, scrollTop: 0 } },
    scrollContainerRef: vi.fn(),
    visibleItems: [
      {
        index: 0,
        key: `step-${selectedStepId}`,
        kind: 'step' as const,
        size: 180,
        start: 300,
        step: { id: selectedStepId },
      },
    ],
    workspaceHeight: 640,
    workspaceWindow: {
      items: [
        {
          index: 0,
          key: `step-${selectedStepId}`,
          kind: 'step' as const,
          size: 180,
          start: 300,
          step: { id: selectedStepId },
        },
      ],
      totalHeight: 640,
    },
  };
}

function renderWorkspace() {
  const step = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Workspace step' });
  const virtualization = createVirtualization(step.id);
  mocks.virtualizationSpy.mockReturnValue(virtualization);

  const props: Parameters<typeof ScenarioEditorWorkspace>[0] = {
    canRedoStep: vi.fn(() => false),
    canUndoStep: vi.fn(() => true),
    onDeleteStep: vi.fn(),
    onDuplicateStep: vi.fn(),
    onInspectStep: vi.fn(),
    onInsertImage: vi.fn(async () => undefined),
    onInsert: vi.fn(),
    onMoveStepByOffset: vi.fn(),
    onMoveStepToPosition: vi.fn(),
    onOpenQuickEdit: vi.fn(),
    onRedoStep: vi.fn(),
    onSelectStep: vi.fn(),
    onUndoStep: vi.fn(),
    onUpdateStep: vi.fn(),
    onVisibleStepChange: vi.fn(),
    project: {
      createdAt: 10,
      id: 'project-1',
      name: 'Workspace project',
      steps: [step],
      suggestedEvents: [],
      trash: [],
      updatedAt: 20,
      version: 2,
    },
    selectedStepId: step.id,
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioEditorWorkspace {...props} />);
  });

  return { props, virtualization };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.viewportSpy.mockReset();
  mocks.virtualizationSpy.mockReset();
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

it('passes virtualization output into the viewport and updates visible-step state', () => {
  const { props, virtualization } = renderWorkspace();

  expect(mocks.virtualizationSpy).toHaveBeenCalledWith(props.project.steps);
  expect(mocks.viewportSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      canRedoStep: props.canRedoStep,
      canUndoStep: props.canUndoStep,
      onInspectStep: props.onInspectStep,
      workspaceHeight: 640,
    })
  );
  expect(props.onVisibleStepChange).toHaveBeenCalledWith(props.selectedStepId);
  expect(virtualization.scrollContainerNodeRef.current.scrollTo).toHaveBeenCalledWith({
    top: 276,
    behavior: 'smooth',
  });
});
