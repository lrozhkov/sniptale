// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../features/scenario/project/public';
import { ScenarioEditorWorkspaceViewport } from './items';

const mocks = vi.hoisted(() => ({
  cardSpy: vi.fn(),
  insertSpy: vi.fn(),
}));

const workspaceCardActionNames = [
  'inspect',
  'delete',
  'duplicate',
  'move-up',
  'move-down',
  'quick-edit',
  'redo',
  'select',
  'undo',
  'update',
  'drag',
  'drop',
] as const;

function renderWorkspaceCardAction(
  props: Record<string, unknown>,
  action: (typeof workspaceCardActionNames)[number]
) {
  const handlers = {
    delete: () => (props['onDelete'] as () => void)(),
    drag: () => (props['onDragStart'] as () => void)(),
    drop: () => (props['onDropAtIndex'] as (index: number) => void)(3),
    duplicate: () => (props['onDuplicate'] as () => void)(),
    inspect: () => (props['onInspect'] as () => void)(),
    'move-down': () => (props['onMoveDown'] as () => void)(),
    'move-up': () => (props['onMoveUp'] as () => void)(),
    'quick-edit': () => (props['onOpenQuickEdit'] as () => void)(),
    redo: () => (props['onRedo'] as () => void)(),
    select: () => (props['onSelect'] as () => void)(),
    undo: () => (props['onUndo'] as () => void)(),
    update: () => (props['onUpdateStep'] as (patch: object) => void)({ title: 'Updated' }),
  };

  return (
    <button
      key={action}
      type="button"
      data-testid={`workspace-card.${action}`}
      onClick={handlers[action]}
    >
      {action}
    </button>
  );
}

vi.mock('./insert-step-actions', () => ({
  InsertStepActions: (props: object) => {
    mocks.insertSpy(props);
    return <div data-testid="insert-actions">insert</div>;
  },
}));

vi.mock('./step-card/ScenarioEditorStepCard', () => ({
  ScenarioEditorStepCard: (props: Record<string, unknown>) => {
    mocks.cardSpy(props);
    return (
      <div>
        {workspaceCardActionNames.map((action) => renderWorkspaceCardAction(props, action))}
      </div>
    );
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderViewport() {
  const step = createScenarioCaptureStep({ assetId: 'asset-1', title: 'Workspace capture' });
  const props = {
    bindMeasuredHeight: vi.fn(() => vi.fn()),
    canRedoStep: vi.fn(() => true),
    canUndoStep: vi.fn(() => false),
    dragStepId: 'drag-step',
    items: [
      { index: 0, key: 'insert-0', kind: 'insert' as const, size: 52, start: 0 },
      { index: 0, key: `step-${step.id}`, kind: 'step' as const, size: 120, start: 52, step },
    ],
    onDeleteStep: vi.fn(),
    onDuplicateStep: vi.fn(),
    onInspectStep: vi.fn(),
    onInsertImage: vi.fn(),
    onInsert: vi.fn(),
    onMoveStepByOffset: vi.fn(),
    onMoveStepToPosition: vi.fn(),
    onOpenQuickEdit: vi.fn(),
    onRedoStep: vi.fn(),
    onSelectStep: vi.fn(),
    onSetDragStepId: vi.fn(),
    onUndoStep: vi.fn(),
    onUpdateStep: vi.fn(),
    selectedStepId: step.id,
    workspaceHeight: 480,
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioEditorWorkspaceViewport {...props} />);
  });

  return { props, step };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.cardSpy.mockReset();
  mocks.insertSpy.mockReset();
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

it('renders insert and step items and maps step callbacks into the card contract', () => {
  const { props, step } = renderViewport();

  act(() => {
    workspaceCardActionNames.forEach((action) => {
      container
        ?.querySelector<HTMLButtonElement>(`[data-testid="workspace-card.${action}"]`)
        ?.click();
    });
  });

  expect(mocks.insertSpy).toHaveBeenCalledWith(
    expect.objectContaining({ index: 0, onInsert: props.onInsert })
  );
  expect(mocks.cardSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      canRedo: true,
      canUndo: false,
      index: 0,
      selected: true,
      step,
    })
  );
  expect(props.onInspectStep).toHaveBeenCalledWith(step.id);
  expect(props.onDeleteStep).toHaveBeenCalledWith(step.id);
  expect(props.onDuplicateStep).toHaveBeenCalledWith(step.id);
  expect(props.onMoveStepByOffset).toHaveBeenCalledWith(step.id, -1);
  expect(props.onMoveStepByOffset).toHaveBeenCalledWith(step.id, 1);
  expect(props.onOpenQuickEdit).toHaveBeenCalledWith(step.id);
  expect(props.onRedoStep).toHaveBeenCalledWith(step.id);
  expect(props.onSelectStep).toHaveBeenCalledWith(step.id);
  expect(props.onUndoStep).toHaveBeenCalledWith(step.id);
  expect(props.onUpdateStep).toHaveBeenCalledWith(step.id, { title: 'Updated' });
  expect(props.onSetDragStepId).toHaveBeenCalledWith(step.id);
  expect(props.onMoveStepToPosition).toHaveBeenCalledWith('drag-step', 3);
  expect(props.bindMeasuredHeight).toHaveBeenCalledWith('insert-0');
  expect(props.bindMeasuredHeight).toHaveBeenCalledWith(`step-${step.id}`);
});

it('skips incomplete step items that do not carry a step payload', () => {
  const { props } = renderViewport();

  act(() => {
    root?.render(
      <ScenarioEditorWorkspaceViewport
        {...props}
        items={[{ index: 0, key: 'step-missing', kind: 'step', size: 100, start: 0 }]}
      />
    );
  });

  expect(container?.textContent).not.toContain('inspect');
});
