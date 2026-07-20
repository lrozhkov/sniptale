// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createScenarioCaptureStep } from '../../../features/scenario/project/public';
import { ScenarioEditorStepCard } from './ScenarioEditorStepCard';

const mocks = vi.hoisted(() => ({
  contentSpy: vi.fn(),
  headerSpy: vi.fn(),
}));

vi.mock('./ScenarioEditorStepCardHeader', () => ({
  ScenarioEditorStepCardHeader: (props: object) => {
    mocks.headerSpy(props);
    return <div data-testid="step-card-header">header</div>;
  },
}));

vi.mock('./ScenarioEditorStepCardContent', () => ({
  ScenarioEditorStepCardContent: (props: object) => {
    mocks.contentSpy(props);
    return (
      <div data-testid="step-card-content">
        <input aria-label="Step title" />
        <textarea aria-label="Step body" />
      </div>
    );
  },
}));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderCard() {
  const props = {
    canRedo: true,
    canUndo: false,
    draggable: true,
    index: 2,
    onDelete: vi.fn(),
    onDragStart: vi.fn(),
    onDropAtIndex: vi.fn(),
    onDuplicate: vi.fn(),
    onInspect: vi.fn(),
    onMoveDown: vi.fn(),
    onMoveUp: vi.fn(),
    onOpenQuickEdit: vi.fn(),
    onRedo: vi.fn(),
    onSelect: vi.fn(),
    onUndo: vi.fn(),
    onUpdateStep: vi.fn(),
    selected: true,
    step: createScenarioCaptureStep({ assetId: 'asset-1', title: 'Capture card' }),
  };

  if (!container) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }

  act(() => {
    root?.render(<ScenarioEditorStepCard {...props} />);
  });

  return props;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('PointerEvent', MouseEvent);
  mocks.contentSpy.mockReset();
  mocks.headerSpy.mockReset();
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

it('wires the header, content, and card surface selection state', () => {
  const props = renderCard();
  const card = container?.querySelector<HTMLElement>('[data-ui="scenario.editor.step-card"]');

  act(() => {
    card?.click();
    card?.dispatchEvent(new Event('dragstart', { bubbles: true }));
    card?.dispatchEvent(new Event('drop', { bubbles: true }));
  });

  expect(card?.dataset['selected']).toBe('true');
  expect(props.onSelect).toHaveBeenCalledTimes(1);
  expect(props.onDragStart).toHaveBeenCalledTimes(1);
  expect(props.onDropAtIndex).toHaveBeenCalledWith(2);
  expect(mocks.headerSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      canRedo: true,
      canUndo: false,
      index: 2,
      onInspect: props.onInspect,
      step: props.step,
    })
  );
  expect(mocks.contentSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      onOpenQuickEdit: props.onOpenQuickEdit,
      onUpdateStep: props.onUpdateStep,
      step: props.step,
    })
  );
});

it('omits the selected marker for inactive cards', () => {
  const props = renderCard();

  act(() => {
    root?.render(<ScenarioEditorStepCard {...props} selected={false} />);
  });

  expect(
    container?.querySelector<HTMLElement>('[data-ui="scenario.editor.step-card"]')?.dataset[
      'selected'
    ]
  ).toBeUndefined();
});

it('suppresses drag start when the pointer gesture begins from editable text fields', () => {
  const props = renderCard();
  const card = container?.querySelector<HTMLElement>('[data-ui="scenario.editor.step-card"]');
  const titleField = container?.querySelector<HTMLInputElement>('input[aria-label="Step title"]');

  act(() => {
    titleField?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    card?.dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true }));
    titleField?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  });

  expect(props.onDragStart).not.toHaveBeenCalled();
});
